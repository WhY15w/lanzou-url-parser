import * as cheerio from "cheerio";
import { createLanzouClient, getHeaders } from "./lanzouHttpClient.js";
/**
 * 解析蓝奏云分享链接
 */
async function parseLanzouUrl(params) {
    const { url, pwd, type, n: rename } = params;
    if (!url)
        return { code: 1, msg: "请输入URL" };
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
    let lastError = null;
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
                if (!pwd)
                    return { code: 1, msg: "请输入分享密码" };
                const cleanCode = firstResponse.data.replace(/\/\*[\s\S]*?\*\//g, "");
                const sign = matchOne(cleanCode, /'sign':'(.*?)',/);
                const fileId = matchOne(cleanCode, /url\s*:\s*'\/ajaxm\.php\?file=(\d+)(?=[^\/]*')/);
                if (!sign || !fileId) {
                    lastError = { code: 1, msg: "获取文件标识失败" };
                    continue;
                }
                const postResult = await getAjaxmResult(client, baseUrl, fileId, {
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
            const iframeResponse = await client.getWithAcwRetry(`${baseUrl}${iframeSrc}`, { headers: getHeaders(inputUrl) });
            const sign = matchOne(iframeResponse.data, /wp_sign = '(.*?)'/);
            const fileId = matchOne(iframeResponse.data.replace(`//url : '/ajaxm.php?file=1',//`, ""), /url\s*:\s*'\/ajaxm\.php\?file=(\d+)(?=[^\/]*')/);
            if (!sign || !fileId) {
                lastError = { code: 1, msg: "获取文件标识失败" };
                continue;
            }
            const postResult = await getAjaxmResult(client, baseUrl, fileId, {
                action: "downprocess",
                signs: "?ctdf",
                sign,
                kd: 1,
            });
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
        }
        catch (err) {
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
async function getInitialCookies(client, baseUrl) {
    try {
        await client.instance.get(baseUrl, {
            headers: getHeaders(baseUrl),
        });
    }
    catch (err) {
        console.warn("获取初始cookie失败:", err instanceof Error ? err.message : err);
    }
}
/**
 * 获取 ajaxm 结果（自动处理 acw_sc__v2）
 */
async function getAjaxmResult(client, baseUrl, fileId, payload) {
    const postUrl = `${baseUrl}/ajaxm.php?file=${fileId}`;
    const res = await client.postWithAcwRetry(postUrl, new URLSearchParams(Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, String(v)]))), { headers: getHeaders(baseUrl) });
    return res.data;
}
/**
 * 处理最终直链
 */
async function handleFinalUrl(client, data, { fileName, fileSize, rename, type, }) {
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
async function resolveFinalUrl(client, url) {
    try {
        const res = await client.headWithAcwRetry(url, {
            headers: getHeaders(url, new URL(url).hostname),
            maxRedirects: 0,
            validateStatus: (s) => s >= 200 && s < 400,
        });
        return res.headers.location ?? url;
    }
    catch (err) {
        if (err instanceof Object &&
            "response" in err &&
            err.response instanceof Object &&
            "status" in err.response &&
            typeof err.response.status === "number" &&
            err.response.status >= 300 &&
            err.response.status < 400 &&
            "headers" in err.response &&
            err.response.headers instanceof Object &&
            "location" in err.response.headers) {
            return err.response.headers.location ?? url;
        }
        console.error("解析最终URL失败:", err instanceof Error ? err.message : err);
        return url;
    }
}
function extractFileName($) {
    return ($(".n_box_3fn").text().trim() ||
        $(".b span").text().trim() ||
        $("title").text().replace(" 蓝奏云", "") ||
        "");
}
function extractFileSize($) {
    return ($(".n_filesize").text().replace("大小：", "").trim() ||
        $("span.p7")
            .parent()
            .contents()
            .filter(function () {
            return this.nodeType === 3;
        })
            .text()
            .trim());
}
function matchOne(text, regex) {
    const m = text.match(regex);
    return m ? m[1] : null;
}
export { parseLanzouUrl };
//# sourceMappingURL=lanzouParser.js.map