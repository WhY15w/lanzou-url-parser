/**
 * 检测响应内容是否触发 acw_sc__v2 校验
 */
function isAcwChallenge(body: unknown): boolean {
  return typeof body === "string" && body.includes("acw_sc__v2");
}

/**
 * 从 HTML 中提取 arg1 并计算 acw_sc__v2
 */
function calcAcwScV2FromHtml(html: string): string | null {
  if (!html || typeof html !== "string") return null;
  const arg1Match = html.match(/arg1='(.*?)'/);
  if (!arg1Match || !arg1Match[1]) return null;
  return acw_sc_v2_simple(arg1Match[1]);
}

/**
 * 将 acw_sc__v2 写入 cookie 字符串
 */
function upsertAcwScCookie(cookieString: string, acwScV2: string): string {
  const current = cookieString || "";
  if (!acwScV2) return current;

  if (/\bacw_sc__v2=/.test(current)) {
    return current.replace(/acw_sc__v2=[^;]+/, `acw_sc__v2=${acwScV2}`);
  }

  return current
    ? `${current}; acw_sc__v2=${acwScV2}`
    : `acw_sc__v2=${acwScV2}`;
}

/**
 * acw_sc__v2 cookie 生成函数
 */
function acw_sc_v2_simple(arg1: string): string {
  const posList = [
    15, 35, 29, 24, 33, 16, 1, 38, 10, 9, 19, 31, 40, 27, 22, 23, 25, 13, 6, 11,
    39, 18, 20, 8, 14, 21, 32, 26, 2, 30, 7, 4, 17, 5, 3, 28, 34, 37, 12, 36,
  ];
  const mask = "3000176000856006061501533003690027800375";
  const outPutList = arrayFill(0, 40, "");

  for (let i = 0; i < arg1.length; i++) {
    const char = arg1[i];
    for (let j = 0; j < posList.length; j++) {
      if (posList[j] === i + 1) outPutList[j] = char;
    }
  }

  const arg2 = outPutList.join("");
  let result = "";
  const length = Math.min(arg2.length, mask.length);

  for (let i = 0; i < length; i += 2) {
    const strHex = arg2.slice(i, i + 2);
    const maskHex = mask.slice(i, i + 2);
    const xorResult = (parseInt(strHex, 16) ^ parseInt(maskHex, 16))
      .toString(16)
      .padStart(2, "0");
    result += xorResult;
  }

  return result;
}

function arrayFill(
  startIndex: number,
  length: number,
  value: string,
): (string | undefined)[] {
  const array: (string | undefined)[] = [];
  for (let i = 0; i < length; i++) array[startIndex + i] = value;
  return array;
}

export {
  isAcwChallenge,
  calcAcwScV2FromHtml,
  upsertAcwScCookie,
  acw_sc_v2_simple,
};
