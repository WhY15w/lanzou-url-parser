import type { LanzouClient } from "./types";
import {
  calcAcwScV2FromHtml,
  isAcwChallenge,
  upsertAcwScCookie,
} from "./anti_acw_sc__v2";
import axios, { type AxiosRequestConfig, type AxiosResponse } from "axios";

const UserAgent =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'

/**
 * 创建带有 acw_sc__v2 自动处理的 HTTP 客户端
 */
function createLanzouClient(): LanzouClient {
  let globalCookies = "";

  const instance = axios.create({
    withCredentials: true,
    timeout: 10000,
  });

  // 请求拦截器：自动注入 Cookie
  instance.interceptors.request.use((config) => {
    if (globalCookies) {
      config.headers.Cookie = globalCookies;
    }
    return config;
  });

  // 响应拦截器：自动保存 Cookie
  instance.interceptors.response.use((response) => {
    const setCookie = response.headers["set-cookie"];
    if (setCookie && setCookie.length) {
      globalCookies = setCookie.map((c) => c.split(";")[0]).join("; ");
    }
    return response;
  });

  /**
   * 从包含 arg1 的 HTML 里计算 acw_sc__v2 并写入全局 cookie
   */
  function applyAcwCookieFromHtml(html: string): boolean {
    try {
      const v = calcAcwScV2FromHtml(html);
      if (!v) return false;
      globalCookies = upsertAcwScCookie(globalCookies, v);
      return true;
    } catch (err: unknown) {
      console.error(
        "处理 acw_sc__v2 失败:",
        err instanceof Error ? err.message : err,
      );
      return false;
    }
  }

  /**
   * 检查响应是否需要 acw_sc__v2 验证，如需要则自动处理
   * @returns 是否需要重试请求
   */
  function handleAcwChallenge(data: unknown): boolean {
    const content = Buffer.isBuffer(data) ? data.toString("utf-8") : data;
    if (isAcwChallenge(content)) {
      console.log("检测到 acw_sc__v2 验证，正在处理...");
      return applyAcwCookieFromHtml(content as string);
    }
    return false;
  }

  /**
   * 带有 acw_sc__v2 自动重试的 GET 请求
   */
  async function getWithAcwRetry(
    url: string,
    config: AxiosRequestConfig = {},
  ): Promise<AxiosResponse> {
    let response = await instance.get(url, config);
    if (handleAcwChallenge(response.data)) {
      response = await instance.get(url, config);
    }
    return response;
  }

  /**
   * 带有 acw_sc__v2 自动重试的 POST 请求
   */
  async function postWithAcwRetry(
    url: string,
    data: unknown,
    config: AxiosRequestConfig = {},
  ): Promise<AxiosResponse> {
    let response = await instance.post(url, data, config);
    if (handleAcwChallenge(response.data)) {
      response = await instance.post(url, data, config);
    }
    return response;
  }

  return {
    instance,
    getWithAcwRetry,
    postWithAcwRetry,
  };
}

/** 直链请求的浏览器化请求头，对齐参考实现 hanximeng/LanzouAPI 的 MloocCurlHead */
const DIRECT_LINK_HEADERS: Record<string, string> = {
  "User-Agent": UserAgent,
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
  "Cache-Control": "max-age=0",
  "Upgrade-Insecure-Requests": "1",
  "X-Requested-With": "mark.via",
};

/** 直链挑战页重试次数 */
const DIRECT_LINK_MAX_ATTEMPTS = 3;

/** 直链解析只应读到体积很小的挑战页；超过该体积说明直接返回了文件本体，放弃解析 */
const DIRECT_LINK_MAX_BODY = 256 * 1024;

/**
 * 解析 /file/ 跳转链接对应的最终直链
 *
 * 蓝奏云 CDN 对缺少浏览器特征的请求会先返回阿里云 ESA 挑战页（200 + var arg1），
 * 带上算出的 acw_sc__v2 重试后才会 302 到真正可下载的地址；
 * 全程不能跟随跳转，否则会直接下载整个文件。
 * 解析失败返回空串，由调用方回退到跳转链接。
 */
async function resolveDirectUrl(url: string): Promise<string> {
  let cookie = "";

  for (let attempt = 0; attempt < DIRECT_LINK_MAX_ATTEMPTS; attempt++) {
    let response: AxiosResponse;

    try {
      response = await axios.get(url, {
        headers: cookie
          ? { ...DIRECT_LINK_HEADERS, Cookie: cookie }
          : DIRECT_LINK_HEADERS,
        maxRedirects: 0,
        maxContentLength: DIRECT_LINK_MAX_BODY,
        validateStatus: () => true,
        timeout: 10000,
      });
    } catch (err: unknown) {
      console.warn(
        "解析最终直链失败:",
        err instanceof Error ? err.message : err,
      );
      return "";
    }

    const location = response.headers.location as string | undefined;

    if (location) return location;

    // 走到这里只可能是挑战页：文件本体已被 maxContentLength 拦下
    const acwScV2 = calcAcwScV2FromHtml(response.data);

    if (!acwScV2) return "";

    cookie = upsertAcwScCookie(cookie, acwScV2);
  }

  return "";
}

/**
 * 生成随机 IP
 */
function randIP(): string {
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
    Math.random() * 255,
  )}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
}

/**
 * 获取请求头
 */
function getHeaders(referer: string, host = ""): Record<string, string> {
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
 * 获取下载用请求头
 */
function getDownloadHeaders(): Record<string, string> {
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Encoding": "identity",
    "Accept-Language": "zh-CN,zh;q=0.8,en;q=0.6",
  };
}

export {
  createLanzouClient,
  getHeaders,
  getDownloadHeaders,
  resolveDirectUrl,
};
