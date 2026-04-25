import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";

/** /ajaxm.php 接口返回数据结构 */
export interface AjaxmResponse {
  /** 1 = 成功，其他值表示失败 */
  zt: number;
  /** 文件名或错误信息 */
  inf: string;
  /** 下载域名，如 "https://xxx.com" */
  dom: string;
  /** 文件路径 */
  url: string;
}

/** 解析成功时的数据 */
export interface ParseSuccessData {
  name: string;
  filesize: string;
  downUrl: string;
}

/** 解析重定向时的数据 */
export interface ParseRedirectData {
  redirect: string;
}

/** parseLanzouUrl 的返回值 */
export type ParseResult =
  | { code: 0; msg: string; data: ParseSuccessData | ParseRedirectData }
  | { code: 1; msg: string; error?: string };

/** createLanzouClient 返回的客户端接口 */
export interface LanzouClient {
  instance: AxiosInstance;
  getWithAcwRetry(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse>;
  postWithAcwRetry(
    url: string,
    data: unknown,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse>;
  headWithAcwRetry(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse>;
  handleAcwChallenge(data: unknown): boolean;
  applyAcwCookieFromHtml(html: string): boolean;
  resetCookies(): void;
  getCookies(): string;
}
