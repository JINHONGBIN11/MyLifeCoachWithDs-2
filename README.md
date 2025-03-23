# MyLifeCoachWithDs-2

一个基于 DeepSeek API 的智能生活教练应用，提供情绪支持和个性化建议。

## 功能特点

- 🤖 智能对话：基于 DeepSeek API 的自然语言交互
- 😊 情绪分析：实时分析用户情绪并提供相应支持
- 📊 情绪追踪：可视化展示历史对话的情绪变化
- 💬 对话历史：保存并管理所有对话记录
- 🎨 现代化界面：响应式设计，支持多设备访问

## 技术栈

- 前端：HTML5, CSS3, JavaScript
- 后端：Node.js, WebSocket
- API：DeepSeek API
- 数据存储：本地存储 (localStorage)

## 安装步骤

1. 克隆仓库
```bash
git clone https://github.com/JINHONGBIN11/MyLifeCoachWithDs-2.git
cd MyLifeCoachWithDs-2
```

2. 安装依赖
```bash
cd backend
npm install
```

3. 配置环境变量
在 backend 目录下创建 `.env` 文件，添加以下内容：
```
DEEPSEEK_API_KEY=你的API密钥
```

4. 启动服务器
```bash
cd backend
node server.js
```

5. 访问应用
打开浏览器访问 `http://localhost:3000`

## 使用说明

1. 主界面
   - 左侧边栏显示历史对话列表
   - 右侧是聊天区域，可以发送消息和接收AI回复
   - 底部有心情选择器，可以标记当前情绪状态

2. 情绪分析
   - 点击左侧边栏的"情绪分析"按钮查看情绪统计
   - 可以查看不同情绪类型的分布
   - 支持按时间范围筛选数据

3. 对话管理
   - 可以创建新对话
   - 支持删除历史对话
   - 自动保存所有对话记录

## 注意事项

- 请确保有有效的 DeepSeek API 密钥
- 建议使用现代浏览器访问应用
- 本地存储有容量限制，请定期清理不需要的对话记录

## 贡献指南

欢迎提交 Issue 和 Pull Request 来帮助改进项目。

## 许可证

MIT License 