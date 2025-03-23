# My AI Life Coach

这是一个基于DeepSeek R1 API开发的AI生活教练网站。通过与AI助手的对话，获取个性化的建议和指导，帮助你在生活中不断成长。

## 项目结构

```
/
├── frontend/           # 前端文件
│   ├── index.html     # 主页面
│   ├── styles/        # CSS样式文件
│   └── js/           # JavaScript文件
├── backend/           # 后端服务器
│   └── server.js     # Node.js服务器文件
└── README.md         # 项目说明文档
```

## 功能特点

- 实时AI对话：通过DeepSeek R1 API实现流畅的对话体验
- 响应式设计：适配各种设备屏幕
- 简洁优雅的界面：专注于对话体验
- 安全的API调用：通过后端服务器处理API请求

## 技术栈

- 前端：HTML5, CSS3, JavaScript
- 后端：Node.js
- API：DeepSeek R1 API

## 开发说明

1. 前端页面采用响应式设计，使用Flexbox布局
2. 使用WebSocket实现流式对话响应
3. 采用简约现代的设计风格
4. 确保代码的可维护性和可扩展性

## 安装和运行

1. 安装Node.js依赖：
```bash
cd backend
npm install
```

2. 启动后端服务器：
```bash
node server.js
```

3. 在浏览器中打开前端页面：
```
frontend/index.html
``` 