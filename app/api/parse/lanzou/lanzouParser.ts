import type { AjaxmResponse, LanzouClient, ParseResult } from "./types";
import { createLanzouClient, getHeaders } from "./lanzouHttpClient";
import * as cheerio from "cheerio";

/**
 * 解析蓝奏云分享链接
 */
async function parseLanzouUrl(params: {
  url: string;
  pwd?: string;
  type?: string;
  n?: string;
}): Promise<ParseResult> {
  const { url, pwd, type, n: rename } = params;
  if (!url) return { code: 1, msg: "请输入URL" };
  if (!/lanzou[\w]*\.com\/[a-zA-Z0-9]/.test(url))
    return { code: 1, msg: "请输入正确的蓝奏云分享链接" };

  // 为每次解析创建新的客户端实例（隔离 Cookie）
  const client = createLanzouClient();

  const baseUrls = [
    "https://www.lanzoux.com",
    "https://www.lanzouf.com",
    "https://www.lanzouj.com",
    "https://www.lanzouu.com",
    "https://www.lanzouw.com",
  ];
  let lastError: ParseResult | null = null;

  for (const baseUrl of baseUrls) {
    try {
      const inputUrl = baseUrl + url.split(".com")[1];

      // Step 0: 访问主页获取初始 Cookie
      await getInitialCookies(client, baseUrl);

      // Step 1: 初次请求（自动处理 acw_sc__v2）
      const firstResponse = await client.getWithAcwRetry(inputUrl, {
        headers: getHeaders(inputUrl),
      });

      if (!firstResponse.data) {
        lastError = { code: 1, msg: "页面无内容" };
        continue;
      }
      if (firstResponse.data.includes("文件取消分享了")) {
        lastError = { code: 1, msg: "文件取消分享了" };
        continue;
      }

      const $ = cheerio.load(firstResponse.data);

      let fileName = extractFileName($);
      const fileSize = extractFileSize($);

      // Step 2: 需要密码
      if (firstResponse.data.includes("function down_p()")) {
        if (!pwd) return { code: 1, msg: "请输入分享密码" };

        const cleanCode = firstResponse.data.replace(/\/\*[\s\S]*?\*\//g, "");
        const sign = extractSign(cleanCode);
        const fileInfo = extractAjaxFileInfo(cleanCode);
        if (!sign || !fileInfo) {
          lastError = { code: 1, msg: "获取文件标识失败" };
          continue;
        }

        const postResult = await getAjaxResult(
          client,
          baseUrl,
          inputUrl,
          fileInfo,
          {
            action: "downprocess",
            sign,
            p: pwd,
            kd: 1,
          },
        );

        if (postResult.zt !== 1) {
          lastError = { code: 1, msg: postResult.inf || "解析失败" };
          continue;
        }

        fileName = postResult.inf || fileName;
        return await handleFinalUrl(client, postResult, {
          fileName,
          fileSize,
          rename: rename || "",
          type: type || "json",
        });
      }

      // Step 3: 无密码
      const iframeSrc = $("iframe").attr("src");
      if (!iframeSrc) {
        lastError = { code: 1, msg: "无法解析下载页面" };
        continue;
      }

      const iframeResponse = await client.getWithAcwRetry(
        `${baseUrl}${iframeSrc}`,
        { headers: getHeaders(inputUrl) },
      );

      const signs = matchOne(iframeResponse.data, /ajaxdata = '(.*?)'/);
      const sign = matchOne(iframeResponse.data, /wp_sign = '(.*?)'/);
      const fileInfo = extractAjaxFileInfo(iframeResponse.data);
      if (!sign || !fileInfo || !signs) {
        lastError = { code: 1, msg: "获取文件标识失败" };
        continue;
      }

      const postResult = await getAjaxResult(
        client,
        baseUrl,
        iframeSrc,
        fileInfo,
        {
          action: "downprocess",
          websignkey: signs,
          signs,
          sign,
          websign: "",
          kd: 1,
          ves: 1,
        },
      );

      if (postResult.zt !== 1) {
        lastError = { code: 1, msg: postResult.inf || "解析失败" };
        continue;
      }

      return await handleFinalUrl(client, postResult, {
        fileName,
        fileSize,
        rename: rename || "",
        type: type || "json",
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.log("解析失败:", message);
      lastError = {
        code: 1,
        msg: "解析异常",
        error: message,
      };
      continue;
    }
  }
  return lastError || { code: 1, msg: "解析失败" };
}

/**
 * 获取初始 Cookie
 */
async function getInitialCookies(
  client: LanzouClient,
  baseUrl: string,
): Promise<void> {
  try {
    await client.instance.get(baseUrl, {
      headers: getHeaders(baseUrl),
    });
  } catch (err: unknown) {
    console.warn(
      "获取初始cookie失败:",
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * 获取 ajaxfile/ajaxm 结果（自动处理 acw_sc__v2）
 */
async function getAjaxResult(
  client: LanzouClient,
  baseUrl: string,
  refererPath: string,
  fileInfo: { path: string; fileId: string },
  payload: Record<string, string | number>,
): Promise<AjaxmResponse> {
  const postUrl = `${baseUrl}${fileInfo.path}${fileInfo.fileId}`;
  const res = await client.postWithAcwRetry(
    postUrl,
    new URLSearchParams(
      Object.fromEntries(
        Object.entries(payload).map(([k, v]) => [k, String(v)]),
      ),
    ),
    {
      headers: {
        ...getHeaders(`${baseUrl}${refererPath}`),
        "content-type": "application/x-www-form-urlencoded",
        Accept: "application/json, text/javascript, */*",
        origin: baseUrl,
        "x-requested-with": "XMLHttpRequest",
      },
    },
  );
  return res.data as AjaxmResponse;
}

/**
 * 处理最终直链
 */
async function handleFinalUrl(
  client: LanzouClient,
  data: AjaxmResponse,
  {
    fileName,
    fileSize,
    rename,
    type,
  }: { fileName: string; fileSize: string; rename: string; type: string },
): Promise<ParseResult> {
  const downUrl1 = `${data.dom}/file/${data.url}`;
  const finalUrl = await resolveFinalUrl(client, downUrl1);
  if (type === "down") {
    return { code: 0, msg: "跳转下载", data: { redirect: finalUrl } };
  }
  return {
    code: 0,
    msg: "解析成功",
    data: { name: rename || fileName, filesize: fileSize, downUrl: finalUrl },
  };
}

/**
 * 通过 HEAD 请求解析跳转后的直链（自动处理 acw_sc__v2）
 */
async function resolveFinalUrl(
  client: LanzouClient,
  url: string,
): Promise<string> {
  try {
    const res = await client.headWithAcwRetry(url, {
      headers: getHeaders(url, new URL(url).hostname),
      maxRedirects: 0,
      validateStatus: (s: number) => s >= 200 && s < 400,
    });
    return (res.headers.location as string | undefined) ?? url;
  } catch (err: unknown) {
    if (
      err instanceof Object &&
      "response" in err &&
      err.response instanceof Object &&
      "status" in err.response &&
      typeof err.response.status === "number" &&
      err.response.status >= 300 &&
      err.response.status < 400 &&
      "headers" in err.response &&
      err.response.headers instanceof Object &&
      "location" in err.response.headers
    ) {
      return (err.response.headers as Record<string, string>).location ?? url;
    }
    console.error("解析最终URL失败:", err instanceof Error ? err.message : err);
    return url;
  }
}

function extractFileName($: cheerio.CheerioAPI): string {
  return (
    $(".n_box_3fn").text().trim() ||
    $(".b span").text().trim() ||
    $("title").text().replace(" 蓝奏云", "") ||
    ""
  );
}

function extractFileSize($: cheerio.CheerioAPI): string {
  return (
    $(".n_filesize").text().replace("大小：", "").trim() ||
    $("span.p7")
      .parent()
      .contents()
      .filter(function () {
        return this.nodeType === 3;
      })
      .text()
      .trim()
  );
}

function matchOne(text: string, regex: RegExp): string | null {
  const m = text.match(regex);
  return m?.[1] ?? null;
}

/**
 * 从页面脚本中提取 ajaxfile/ajaxm 接口路径与文件 id
 * 新版页面统一走 /ajaxfile.php，旧版为 /ajaxm.php，两种都兼容；
 * 同时跳过旧模板中被注释掉的示例行（//url : '/ajaxm.php?file=1',//）
 */
function extractAjaxFileInfo(
  code: string,
): { path: string; fileId: string } | null {
  const regex = /url\s*:\s*'(\/ajax[a-z]*\.php\?file=)(\d+)/g;
  let m: RegExpExecArray | null;
  let result: { path: string; fileId: string } | null = null;

  while ((m = regex.exec(code)) !== null) {
    const prefix = code.slice(Math.max(0, m.index - 2), m.index);

    if (prefix.includes("//")) continue;
    result = { path: m[1], fileId: m[2] };
  }

  return result;
}

/**
 * 从页面脚本中提取 downprocess 请求的 sign 参数
 * 新页面把 sign 存进变量再引用（var isngis = 'xxx'; ... 'sign':isngis,），
 * 旧页面直接内联（'sign':'xxx',），两种都兼容
 */
function extractSign(code: string): string | null {
  // 旧版：sign 内联在 ajax data 里
  const inline = matchOne(code, /'sign':'(.*?)',/);
  if (inline) return inline;

  // 新版：sign 引用变量，先取变量名，再取其最后一次非空赋值
  const varName = matchOne(code, /'sign':\s*([A-Za-z_$][\w$]*)\s*,/);
  if (!varName) return null;

  const varRegex = new RegExp(`var\\s+${varName}\\s*=\\s*'([^']*)'`, "g");
  const values: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = varRegex.exec(code)) !== null) {
    values.push(m[1]!);
  }
  return values.filter((v) => v).pop() ?? null;
}

export { parseLanzouUrl };
