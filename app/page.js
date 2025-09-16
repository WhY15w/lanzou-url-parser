"use client";

import { useState } from "react";
import {
  ClipboardIcon,
  DownloadIcon,
  Loader2Icon,
  CheckIcon,
  AlertCircleIcon,
} from "lucide-react";

export default function Home() {
  const [url, setUrl] = useState("");
  const [password, setPassword] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const handleParse = async () => {
    // 重置状态
    setResult(null);
    setError("");
    setCopied(false);

    // 简单验证
    if (!url.trim()) {
      setError("请输入蓝奏云链接");
      return;
    }

    try {
      setLoading(true);
      const response = await fetch("/api/parse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: url.trim(),
          pwd: password.trim() || undefined,
          type: "parse",
        }),
      });

      const data = await response.json();

      if (data.code === 0) {
        setResult(data.data);
      } else {
        setError(data.msg || "解析失败，请重试");
      }
    } catch (err) {
      console.error("解析错误:", err);
      setError("服务器错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (result?.downUrl) {
      navigator.clipboard.writeText(result.downUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (result?.downUrl) {
      window.open(result.downUrl, "_blank");
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      handleParse();
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden transition-all duration-300 hover:shadow-2xl">
        <div className="p-6 sm:p-8">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              蓝奏云直链解析
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              快速解析蓝奏云分享链接，获取直链下载地址
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label
                htmlFor="url"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                蓝奏云链接
              </label>
              <input
                type="text"
                id="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="例如: https://xxx.lanzouo.com/xxxxxxx"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white transition-all"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                提取码 (如需要)
              </label>
              <input
                type="text"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="输入分享密码"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white transition-all"
              />
            </div>

            <button
              onClick={handleParse}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-all duration-200 flex items-center justify-center space-x-2 disabled:bg-blue-400">
              {loading ? (
                <>
                  <Loader2Icon className="w-5 h-5 animate-spin" />
                  <span>解析中...</span>
                </>
              ) : (
                <>
                  <span>开始解析</span>
                </>
              )}
            </button>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg flex items-center space-x-2">
                <AlertCircleIcon className="w-5 h-5" />
                <span>{error}</span>
              </div>
            )}

            {result && (
              <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <h3 className="font-medium text-green-800 dark:text-green-300 mb-2">
                  解析成功
                </h3>

                {result.name && (
                  <div className="text-sm text-gray-700 dark:text-gray-300 mb-1">
                    <span className="font-medium">文件名:</span> {result.name}
                  </div>
                )}

                {result.filesize && (
                  <div className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                    <span className="font-medium">文件大小:</span>{" "}
                    {result.filesize}
                  </div>
                )}

                <div className="flex items-center space-x-2 mb-3">
                  <input
                    type="text"
                    value={result.downUrl}
                    readOnly
                    className="flex-1 px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-sm text-gray-900 dark:text-gray-100 truncate"
                  />
                  <button
                    onClick={handleCopy}
                    className="p-2 bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-800/40 text-blue-600 dark:text-blue-300 rounded transition-colors"
                    title="复制链接">
                    {copied ? (
                      <CheckIcon className="w-4 h-4" />
                    ) : (
                      <ClipboardIcon className="w-4 h-4" />
                    )}
                  </button>
                </div>

                <button
                  onClick={handleDownload}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition-all duration-200 flex items-center justify-center space-x-2">
                  <DownloadIcon className="w-4 h-4" />
                  <span>直接下载</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-700/50 px-6 py-3 text-center text-sm text-gray-500 dark:text-gray-400">
          注意: 本工具仅用于学习交流，请勿用于非法用途
        </div>
      </div>

      <footer className="mt-8 text-center text-gray-500 dark:text-gray-400 text-sm">
        <p>
          © {new Date().getFullYear()} 蓝奏云直链解析工具 | HurryWang | Build
          with Next.js
        </p>
      </footer>
    </main>
  );
}
