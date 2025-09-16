# 蓝奏云直链解析工具

一个基于 Next.js 的蓝奏云分享链接直链解析工具，可以快速获取文件的真实下载地址。

## ✨ 功能特性

- 🚀 快速解析蓝奏云分享链接
- 🔐 支持密码保护的分享链接
- 📱 响应式设计，支持移动端
- 🌙 支持深色模式
- 📋 一键复制直链地址
- ⬇️ 直接跳转下载

## 🛠️ 技术栈

- **框架**: Next.js 15
- **样式**: Tailwind CSS
- **图标**: Lucide React
- **HTTP 客户端**: Axios
- **DOM 解析**: JSDOM

## 📦 安装与运行

### 环境要求

- Node.js 18+
- npm 或 yarn

### 本地开发

```bash
# 克隆项目
git clone <repository-url>
cd lanzou-url-parser

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000) 查看应用。

### 生产部署

```bash
# 构建项目
npm run build

# 启动生产服务器
npm start
```

## 🚀 使用方法

1. 输入蓝奏云分享链接
2. 如果有密码，输入提取码
3. 点击"开始解析"按钮
4. 获取直链地址，可以复制或直接下载

## 📝 API 接口

### POST /api/parse

解析蓝奏云链接的 API 接口。

**请求参数:**

```json
{
  "url": "蓝奏云分享链接",
  "pwd": "提取码（可选）",
  "type": "parse"
}
```

**响应格式:**

```json
{
  "code": 0,
  "msg": "解析成功",
  "data": {
    "name": "文件名",
    "filesize": "文件大小",
    "downUrl": "直链地址"
  }
}
```

## 📄 许可证

本项目仅用于学习交流，请勿用于非法用途。

## 👨‍💻 作者

**HurryWang** - [GitHub](https://github.com/WhY15w)

---

⭐ 如果这个项目对你有帮助，请给个星标支持！
