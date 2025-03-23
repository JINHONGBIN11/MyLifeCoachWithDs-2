require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();

// 在Vercel环境中使用适当的端口
const PORT = process.env.PORT || 3000;

// 配置CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json());

// 存储对话历史和响应流
const conversations = new Map();
const responseStreams = new Map();

// 心情映射
const moodMap = {
    happy: 1,
    excited: 0.8,
    peaceful: 0.6,
    confused: 0.4,
    anxious: 0.3,
    sad: 0.2,
    angry: 0.1,
    tired: 0.5
};

// 心情对应的系统提示词
const moodPrompts = {
    happy: "你现在心情愉快，让我们继续保持这种积极的状态。",
    excited: "你感到兴奋，这种能量很棒！让我们把它转化为动力。",
    peaceful: "你感到平静，这是一个很好的状态，让我们保持这种平和。",
    confused: "你感到困惑，这是正常的，让我们一起理清思路。",
    anxious: "你感到焦虑，让我们一起来缓解这种情绪。",
    sad: "你感到难过，我在这里倾听和支持你。",
    angry: "你感到生气，让我们一起来处理这种情绪。",
    tired: "你感到疲惫，让我们来调整一下状态。"
};

// 处理聊天请求
app.post('/api/chat', async (req, res) => {
  try {
    const { content, mood, conversationId } = req.body;
    
    if (!content || !conversationId) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    if (!process.env.DEEPSEEK_API_KEY) {
      return res.status(500).json({ error: 'API密钥未配置' });
    }
    
    let conversation = conversations.get(conversationId);
    if (!conversation) {
      conversation = {
        id: conversationId,
        messages: [],
        mood: mood || 'peaceful',
        title: content.slice(0, 20) + (content.length > 20 ? '...' : '')
      };
      conversations.set(conversationId, conversation);
    }
    
    conversation.messages.push({
      content,
      isUser: true,
      timestamp: Date.now(),
      mood
    });
    
    const systemPrompt = moodPrompts[mood] || moodPrompts.peaceful;
    const messages = [
      { role: "system", content: systemPrompt },
      ...conversation.messages.map(msg => ({
        role: msg.isUser ? "user" : "assistant",
        content: msg.content
      }))
    ];

    console.log('发送请求到 DeepSeek API...');
    console.log('消息列表:', messages);
    
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: messages,
        stream: true,
        temperature: moodMap[mood] || 0.6,
        max_tokens: 2000
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('DeepSeek API 错误响应:', errorText);
      throw new Error(`API请求失败: ${response.status} - ${errorText}`);
    }
    
    // 存储响应流
    responseStreams.set(conversationId, {
      stream: response.body,
      buffer: '',
      isDone: false,
      createdAt: Date.now()
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('处理聊天请求失败:', error);
    res.status(500).json({ error: error.message || '处理聊天请求失败' });
  }
});

// 获取流式响应
app.get('/api/chat/:conversationId/stream', (req, res) => {
  try {
    const { conversationId } = req.params;
    const streamData = responseStreams.get(conversationId);
    
    if (!streamData) {
      return res.status(404).json({ error: '未找到响应流' });
    }
    
    if (streamData.isDone) {
      // 清理响应流
      responseStreams.delete(conversationId);
      return res.json({ type: 'done', content: streamData.buffer });
    }
    
    // 处理新的数据块
    let newContent = '';
    streamData.stream.on('data', chunk => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            streamData.isDone = true;
            break;
          } else {
            try {
              const parsed = JSON.parse(data);
              if (parsed.choices && parsed.choices[0].delta.content) {
                const content = parsed.choices[0].delta.content;
                newContent += content;
                streamData.buffer += content;
              }
            } catch (e) {
              console.error('解析响应数据失败:', e);
            }
          }
        }
      }
    });
    
    // 等待一小段时间以收集数据
    setTimeout(() => {
      if (newContent) {
        res.json({ type: 'content', content: newContent });
      } else if (streamData.isDone) {
        responseStreams.delete(conversationId);
        res.json({ type: 'done', content: streamData.buffer });
      } else {
        res.json({ type: 'waiting' });
      }
    }, 500);
  } catch (error) {
    console.error('获取响应流失败:', error);
    res.status(500).json({ error: '获取响应流失败' });
  }
});

// 获取所有对话
app.get('/api/conversations', (req, res) => {
  try {
    const conversationsArray = Array.from(conversations.values());
    res.json(conversationsArray);
  } catch (error) {
    console.error('获取对话列表失败:', error);
    res.status(500).json({ error: '获取对话列表失败' });
  }
});

// 健康检查端点
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({ error: '服务器内部错误' });
});

// 仅在非Vercel环境中启动服务器
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`服务器运行在端口 ${PORT}`);
  });
}

// 导出应用实例供Vercel使用
module.exports = app; 