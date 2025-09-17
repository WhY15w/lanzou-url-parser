import { NextResponse } from "next/server";
import axios from "axios";
import { JSDOM } from "jsdom";

const UserAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.121 Safari/537.36";

const allowHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.next();
}

export async function POST(request) {
  try {
    if (request.method === "OPTIONS") {
      return NextResponse.next();
    }

    const body = await request.json();
    const result = await parseLanzouUrl(body);
    const res = NextResponse.json(result);
    Object.entries(allowHeaders).forEach(([k, v]) => res.headers.set(k, v));
    return res;
  } catch (error) {
    console.error("API错误:", error);
    const res = NextResponse.json(
      { code: 1, msg: "服务器错误", error: error.message },
      { status: 500 }
    );
    Object.entries(allowHeaders).forEach(([k, v]) => res.headers.set(k, v));
    return res;
  }
}

/**
 * 解析蓝奏云分享链接
 */
async function parseLanzouUrl(params) {
  const { url: inputUrl, pwd, type, n: rename } = params;
  if (!inputUrl) return { code: 1, msg: "请输入URL" };

  try {
    const baseUrl = inputUrl.split(".com/")[0] + ".com";

    // Step 1: 初次请求
    const firstResponse = await axios.get(inputUrl, {
      headers: getHeaders(inputUrl),
    });

    if (!firstResponse.data) {
      return { code: 1, msg: "页面无内容" };
    }
    if (firstResponse.data.includes("文件取消分享了")) {
      return { code: 1, msg: "文件取消分享了" };
    }

    const dom = new JSDOM(firstResponse.data);
    const document = dom.window.document;

    // 提取文件名、大小（多级 fallback）
    let fileName = extractFileName(document);
    const fileSize = extractFileSize(document);

    // Step 2: 判断是否需要密码
    if (firstResponse.data.includes("function down_p()")) {
      if (!pwd) return { code: 1, msg: "请输入分享密码" };

      // 获取 sign 和 fileId
      const cleanCode = firstResponse.data.replace(/\/\*[\s\S]*?\*\//g, "");
      const sign = matchOne(cleanCode, /'sign':'(.*?)',/);
      const fileId = matchOne(
        cleanCode,
        /url\s*:\s*'\/ajaxm\.php\?file=(\d+)(?=[^\/]*')/
      );
      if (!sign || !fileId) return { code: 1, msg: "获取文件标识失败" };

      const postResult = await getAjaxmResult(baseUrl, fileId, {
        action: "downprocess",
        sign,
        p: pwd,
        kd: 1,
      });

      if (postResult.zt !== 1) {
        return { code: 1, msg: postResult.inf || "解析失败" };
      }

      fileName = postResult.inf || fileName;
      return await handleFinalUrl(postResult, {
        fileName,
        fileSize,
        rename,
        type,
      });
    }

    // Step 3: 无密码情况
    const iframeSrc = document.querySelector("iframe")?.src;
    if (!iframeSrc) return { code: 1, msg: "无法解析下载页面" };

    const iframeResponse = await axios.get(`${baseUrl}${iframeSrc}`, {
      headers: getHeaders(inputUrl),
    });

    const sign = matchOne(iframeResponse.data, /wp_sign = '(.*?)'/);
    const fileId = matchOne(
      iframeResponse.data.replace(`//url : '/ajaxm.php?file=1',//`, ""),
      /url\s*:\s*'\/ajaxm\.php\?file=(\d+)(?=[^\/]*')/
    );
    if (!sign || !fileId) return { code: 1, msg: "获取文件标识失败" };

    const postResult = await getAjaxmResult(baseUrl, fileId, {
      action: "downprocess",
      signs: "?ctdf",
      sign,
      kd: 1,
    });

    if (postResult.zt !== 1) {
      return { code: 1, msg: postResult.inf || "解析失败" };
    }

    return await handleFinalUrl(postResult, {
      fileName,
      fileSize,
      rename,
      type,
    });
  } catch (error) {
    console.error("解析错误:", error);
    return {
      code: 1,
      msg: "解析异常",
      error: error?.message || error?.toString(),
    };
  }
}

/**
 * 提交 ajaxm 请求
 */
async function getAjaxmResult(baseUrl, fileId, payload) {
  const postUrl = `${baseUrl}/ajaxm.php?file=${fileId}`;
  const res = await axios.post(postUrl, new URLSearchParams(payload), {
    headers: getHeaders(baseUrl),
  });
  return res.data;
}

/**
 * 处理最终直链
 */
async function handleFinalUrl(data, { fileName, fileSize, rename, type }) {
  const downUrl1 = `${data.dom}/file/${data.url}`;
  const finalUrl = await resolveFinalUrl(downUrl1);

  if (type === "down") {
    return { code: 0, msg: "跳转下载", data: { redirect: finalUrl } };
  }

  return {
    code: 0,
    msg: "解析成功",
    data: {
      name: rename || fileName,
      filesize: fileSize,
      downUrl: finalUrl,
    },
  };
}

/**
 * 通过 HEAD 请求解析跳转后的直链
 */
async function resolveFinalUrl(url) {
  const res = await axios.head(url, {
    headers: getHeaders(url, "developer-oss.lanrar.com"),
    maxRedirects: 0,
    validateStatus: (status) => status >= 200 && status < 400,
  });
  return res.headers.location || url;
}

/**
 * 提取文件名
 */
function extractFileName(document) {
  return (
    document.querySelector(".n_box_3fn")?.textContent?.trim() ||
    document.querySelector(".b span")?.textContent?.trim() ||
    document.querySelector("title")?.textContent?.replace(" 蓝奏云", "") ||
    ""
  );
}

/**
 * 提取文件大小
 */
function extractFileSize(document) {
  return (
    document
      .querySelector(".n_filesize")
      ?.textContent.replace("大小：", "")
      .trim() ||
    document.querySelector("span.p7")?.nextSibling?.textContent?.trim() ||
    ""
  );
}

/**
 * 工具函数：正则匹配第一个分组
 */
function matchOne(text, regex) {
  const m = text.match(regex);
  return m ? m[1] : null;
}

/**
 * 构造请求头
 */
function getHeaders(referer, host = "") {
  return {
    "User-Agent": UserAgent,
    "X-FORWARDED-FOR": randIP(),
    "CLIENT-IP": randIP(),
    Referer: referer,
    Connection: "Keep-Alive",
    Accept: "*/*",
    "Accept-Language": "zh-cn",
    Host: host,
  };
}

/**
 * 随机IP
 */
function randIP() {
  const arr = [
    "218",
    "218",
    "66",
    "66",
    "218",
    "218",
    "60",
    "60",
    "202",
    "204",
    "66",
    "66",
    "66",
    "59",
    "61",
    "60",
    "222",
    "221",
    "66",
    "59",
    "60",
    "60",
    "66",
    "218",
    "218",
    "62",
    "63",
    "64",
    "66",
    "66",
    "122",
    "211",
  ];
  return `${arr[Math.floor(Math.random() * arr.length)]}.${Math.floor(
    Math.random() * 255
  )}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
}
