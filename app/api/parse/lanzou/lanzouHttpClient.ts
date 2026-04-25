import type { LanzouClient } from "./types";
import {
  calcAcwScV2FromHtml,
  isAcwChallenge,
  upsertAcwScCookie,
} from "./anti_acw_sc__v2";
import axios, { type AxiosRequestConfig, type AxiosResponse } from "axios";

const UserAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.121 Safari/537.36";

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

  /**
   * 带有 acw_sc__v2 自动重试的 HEAD 请求
   */
  async function headWithAcwRetry(
    url: string,
    config: AxiosRequestConfig = {},
  ): Promise<AxiosResponse> {
    let response = await instance.head(url, config);
    if (handleAcwChallenge(response.data)) {
      response = await instance.head(url, config);
    }
    return response;
  }

  /**
   * 重置 Cookie
   */
  function resetCookies(): void {
    globalCookies = "";
  }

  /**
   * 获取当前 Cookie
   */
  function getCookies(): string {
    return globalCookies;
  }

  return {
    instance,
    getWithAcwRetry,
    postWithAcwRetry,
    headWithAcwRetry,
    handleAcwChallenge,
    applyAcwCookieFromHtml,
    resetCookies,
    getCookies,
  };
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

export { createLanzouClient, getHeaders, getDownloadHeaders };
