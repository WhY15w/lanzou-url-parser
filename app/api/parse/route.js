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

// 创建可复用的axios实例，用于处理cookie
const axiosInstance = axios.create({
  withCredentials: true, // 自动处理cookie
  timeout: 10000,
});

// 存储全局cookie
let globalCookies = "";

// 请求拦截器处理cookie
axiosInstance.interceptors.request.use((config) => {
  if (globalCookies) {
    config.headers.Cookie = globalCookies;
  }
  return config;
});

// 响应拦截器更新cookie
axiosInstance.interceptors.response.use((response) => {
  const setCookie = response.headers["set-cookie"];
  if (setCookie && setCookie.length) {
    globalCookies = setCookie.map((c) => c.split(";")[0]).join("; ");
  }
  return response;
});

export async function OPTIONS() {
  return NextResponse.next();
}

export async function POST(request) {
  try {
    if (request.method === "OPTIONS") {
      return NextResponse.next();
    }

    // 重置全局cookie
    globalCookies = "";

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
  const { url, pwd, type, n: rename } = params;
  if (!url) return { code: 1, msg: "请输入URL" };

  if (!/lanzou[\w]*\.com\/[a-zA-Z0-9]/.test(url)) {
    return { code: 1, msg: "请输入正确的蓝奏云分享链接" };
  }

  // 支持多 baseUrl 尝试
  const baseUrls = [
    "https://www.lanzoux.com",
    "https://www.lanzouf.com",
    "https://www.lanzouj.com",
    "https://www.lanzouu.com",
    "https://www.lanzouw.com",
  ];
  let lastError = null;
  for (const baseUrl of baseUrls) {
    try {
      const inputUrl = baseUrl + url.split(".com")[1];

      // 先访问主页获取初始cookie
      await getInitialCookies(baseUrl);

      // Step 1: 初次请求
      const firstResponse = await axiosInstance.get(inputUrl, {
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

      // 检查是否需要生成acw_sc_v2 cookie
      if (firstResponse.data.includes("acw_sc__v2")) {
        await handleAcwScCookie(firstResponse.data, baseUrl);
      }

      const dom = new JSDOM(firstResponse.data);
      const document = dom.window.document;

      // 提取文件名、大小
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

        if (!sign || !fileId) {
          lastError = { code: 1, msg: "获取文件标识失败" };
          continue;
        }

        const postResult = await getAjaxmResult(baseUrl, fileId, {
          action: "downprocess",
          sign,
          p: pwd,
          kd: 1,
        });

        if (postResult.zt !== 1) {
          lastError = { code: 1, msg: postResult.inf || "解析失败" };
          continue;
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
      if (!iframeSrc) {
        lastError = { code: 1, msg: "无法解析下载页面" };
        continue;
      }

      const iframeResponse = await axiosInstance.get(`${baseUrl}${iframeSrc}`, {
        headers: getHeaders(inputUrl),
      });

      // 处理iframe页面可能需要的cookie
      if (iframeResponse.data.includes("acw_sc__v2")) {
        await handleAcwScCookie(iframeResponse.data, baseUrl);
      }

      const sign = matchOne(iframeResponse.data, /wp_sign = '(.*?)'/);
      const fileId = matchOne(
        iframeResponse.data.replace(`//url : '/ajaxm.php?file=1',//`, ""),
        /url\s*:\s*'\/ajaxm\.php\?file=(\d+)(?=[^\/]*')/
      );

      if (!sign || !fileId) {
        lastError = { code: 1, msg: "获取文件标识失败" };
        continue;
      }

      const postResult = await getAjaxmResult(baseUrl, fileId, {
        action: "downprocess",
        signs: "?ctdf",
        sign,
        kd: 1,
      });

      if (postResult.zt !== 1) {
        lastError = { code: 1, msg: postResult.inf || "解析失败" };
        continue;
      }

      return await handleFinalUrl(postResult, {
        fileName,
        fileSize,
        rename,
        type,
      });
    } catch (error) {
      lastError = {
        code: 1,
        msg: "解析异常",
        error: error?.message || error?.toString(),
      };
      continue;
    }
  }
  return lastError || { code: 1, msg: "解析失败" };
}

/**
 * 获取初始cookie
 */
async function getInitialCookies(baseUrl) {
  try {
    await axiosInstance.get(baseUrl, {
      headers: getHeaders(baseUrl),
    });
  } catch (error) {
    console.warn("获取初始cookie失败:", error.message);
  }
}

/**
 * 处理acw_sc_v2 cookie生成
 */
async function handleAcwScCookie(html, baseUrl) {
  try {
    // 提取arg1参数
    const arg1Match = html.match(/arg1='(.*?)'/);
    if (!arg1Match || !arg1Match[1]) {
      console.warn("未找到arg1参数，无法生成acw_sc_v2 cookie");
      return;
    }

    const arg1 = arg1Match[1];
    const acwScV2 = acw_sc_v2_simple(arg1);

    // 更新全局cookie
    if (globalCookies.includes("acw_sc__v2=")) {
      globalCookies = globalCookies.replace(
        /acw_sc__v2=[^;]+/,
        `acw_sc__v2=${acwScV2}`
      );
    } else {
      globalCookies += `; acw_sc__v2=${acwScV2}`;
    }

    // 用新cookie再次请求确认
    await axiosInstance.get(baseUrl, {
      headers: getHeaders(baseUrl),
    });
  } catch (error) {
    console.error("生成acw_sc_v2 cookie失败:", error.message);
  }
}

/**
 * cookie生成函数
 */
function acw_sc_v2_simple(arg1) {
  const posList = [
    15, 35, 29, 24, 33, 16, 1, 38, 10, 9, 19, 31, 40, 27, 22, 23, 25, 13, 6, 11,
    39, 18, 20, 8, 14, 21, 32, 26, 2, 30, 7, 4, 17, 5, 3, 28, 34, 37, 12, 36,
  ];
  const mask = "3000176000856006061501533003690027800375";
  const outPutList = arrayFill(0, 40, "");

  for (let i = 0; i < arg1.length; i++) {
    const char = arg1[i];
    for (let j = 0; j < posList.length; j++) {
      if (posList[j] === i + 1) {
        outPutList[j] = char;
      }
    }
  }

  const arg2 = outPutList.join("");
  let result = "";
  const length = Math.min(arg2.length, mask.length);

  for (let i = 0; i < length; i += 2) {
    const strHex = arg2.substr(i, 2);
    const maskHex = mask.substr(i, 2);
    const xorResult = (parseInt(strHex, 16) ^ parseInt(maskHex, 16)).toString(
      16
    );
    result += xorResult.padStart(2, "0");
  }

  return result;
}

/**
 * 数组填充辅助函数
 */
function arrayFill(startIndex, length, value) {
  const array = [];
  for (let i = 0; i < length; i++) {
    array[startIndex + i] = value;
  }
  return array;
}

/**
 * 提交 ajaxm 请求
 */
async function getAjaxmResult(baseUrl, fileId, payload) {
  const postUrl = `${baseUrl}/ajaxm.php?file=${fileId}`;
  const res = await axiosInstance.post(postUrl, new URLSearchParams(payload), {
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
async function resolveFinalUrl(url, redirectCount = 0) {
  const maxRedirects = 10;

  // 如果达到最大重定向次数，返回当前URL
  if (redirectCount >= maxRedirects) {
    console.warn(`达到最大重定向次数 (${maxRedirects})，返回当前URL`);
    return url;
  }

  try {
    const res = await axiosInstance.head(url, {
      headers: getHeaders(url, new URL(url).hostname),
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 400,
    });

    console.error(res.status, res.headers);

    // 如果有重定向，递归跟踪
    if (res.headers.location) {
      const nextUrl = res.headers.location;
      console.error(`重定向 ${redirectCount + 1}: ${url} -> ${nextUrl}`);
      return await resolveFinalUrl(nextUrl, redirectCount + 1);
    }
    console.error(`最终URL: ${url}`);

    // 没有重定向，返回当前URL
    return url;
  } catch (error) {
    // 如果HEAD请求失败，尝试用GET请求获取重定向
    if (
      error.response &&
      error.response.status >= 300 &&
      error.response.status < 400
    ) {
      const nextUrl = error.response.headers.location;
      if (nextUrl) {
        console.error(
          `重定向 ${redirectCount + 1} (通过错误处理): ${url} -> ${nextUrl}`
        );
        return await resolveFinalUrl(nextUrl, redirectCount + 1);
      }
      return url;
    }
    console.error("解析最终URL失败:", error.message);
    return url;
  }
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
