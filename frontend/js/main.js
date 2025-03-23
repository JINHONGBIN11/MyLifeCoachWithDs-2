// 状态变量
let currentConversation = {
  id: Date.now().toString(),
  title: '新对话',
  messages: [],
  mood: 'peaceful'
};

// DOM元素
const messagesContainer = document.querySelector('.messages-container');
const messageInput = document.querySelector('.message-input');
const sendButton = document.querySelector('.send-button');
const moodButtons = document.querySelectorAll('.mood-btn');
const historyList = document.querySelector('.history-list');
const moodAnalysisBtn = document.querySelector('.mood-analysis-btn');
const moodAnalysisContent = document.querySelector('.mood-analysis-content');

// 历史对话存储
let conversations = JSON.parse(localStorage.getItem('conversations') || '[]');

// 显示错误消息
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    messagesContainer.appendChild(errorDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// 创建消息元素
function createMessageElement(content, isUser = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    
    const messageContent = document.createElement('div');
    messageContent.className = isUser ? 'message-user' : 'message-ai';
    messageContent.textContent = content;
    
    messageDiv.appendChild(messageContent);
    return messageDiv;
}

// 添加消息到界面
function appendMessage(content, isUser = false) {
    if (!isUser && !document.querySelector('.message-ai:last-child')) {
        const messageDiv = createMessageElement(content, isUser);
        messagesContainer.appendChild(messageDiv);
    } else if (!isUser) {
        const lastAiMessage = document.querySelector('.message-ai:last-child');
        if (lastAiMessage) {
            lastAiMessage.textContent += content;
        }
    } else {
        const messageDiv = createMessageElement(content, isUser);
        messagesContainer.appendChild(messageDiv);
    }
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// 显示输入指示器
function showTypingIndicator() {
    if (!document.querySelector('.typing-indicator')) {
        const indicator = document.createElement('div');
        indicator.className = 'typing-indicator';
        for (let i = 0; i < 3; i++) {
            const dot = document.createElement('div');
            dot.className = 'typing-dot';
            indicator.appendChild(dot);
        }
        messagesContainer.appendChild(indicator);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

// 隐藏输入指示器
function hideTypingIndicator() {
    const indicator = document.querySelector('.typing-indicator');
    if (indicator) {
        indicator.remove();
    }
}

// 发送消息
async function sendMessage() {
    const content = messageInput.value.trim();
    
    if (!content) return;
    
    try {
        // 显示用户消息
        appendMessage(content, true);
        
        // 确保当前对话存在
        if (!currentConversation) {
            currentConversation = {
                id: Date.now().toString(),
                title: '新对话',
                messages: [],
                mood: 'peaceful'
            };
            conversations.unshift(currentConversation);
        }
        
        // 更新当前对话
        currentConversation.messages.push({
            role: 'user',
            content: content
        });
        
        // 保存用户消息到本地存储
        saveConversation();
        
        // 清空输入框并显示输入指示器
        messageInput.value = '';
        showTypingIndicator();
        
        // 发送POST请求到服务器
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                content,
                mood: currentConversation.mood,
                conversationId: currentConversation.id
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('服务器响应错误:', response.status, errorText);
            throw new Error(`服务器响应错误: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let aiResponse = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.trim() === '' || line.startsWith(':')) continue;

                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') {
                            // 保存AI回复到对话历史
                            if (aiResponse) {
                                currentConversation.messages.push({
                                    role: 'assistant',
                                    content: aiResponse
                                });
                                saveConversation();
                            }
                            hideTypingIndicator();
                            break;
                        }

                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.content) {
                                aiResponse += parsed.content;
                                appendMessage(parsed.content, false);
                            } else if (parsed.error) {
                                throw new Error(parsed.error);
                            }
                        } catch (e) {
                            console.error('解析响应数据失败:', e, '原始数据:', data);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('处理流式响应时出错:', error);
            throw error;
        } finally {
            hideTypingIndicator();
        }
    } catch (error) {
        console.error('发送消息失败:', error);
        showError(`发送消息失败: ${error.message}`);
        hideTypingIndicator();
    }
}

// 更新历史对话列表
function updateHistoryList() {
  const historyList = document.getElementById('historyList');
  if (!historyList) return;
  
  try {
    historyList.innerHTML = '';
    conversations.forEach(conv => {
      const historyItem = document.createElement('div');
      historyItem.className = 'history-item';
      if (currentConversation && conv.id === currentConversation.id) {
        historyItem.classList.add('active');
      }
      
      // 创建标题文本
      const titleSpan = document.createElement('span');
      const title = conv.messages && conv.messages.length > 0 
        ? conv.messages.find(msg => msg.role === 'user')?.content.slice(0, 20) + (conv.messages.find(msg => msg.role === 'user')?.content.length > 20 ? '...' : '')
        : '新对话';
      titleSpan.textContent = title;
      
      // 创建删除按钮
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-chat-btn';
      deleteBtn.textContent = '删除对话';
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        deleteConversation(conv.id);
      };
      
      // 组装历史项
      historyItem.appendChild(titleSpan);
      historyItem.appendChild(deleteBtn);
      historyItem.onclick = () => loadConversation(conv.id);
      historyList.appendChild(historyItem);
    });
  } catch (error) {
    console.error('更新历史列表失败:', error);
    try {
      const savedConversations = localStorage.getItem('conversations');
      if (savedConversations) {
        conversations = JSON.parse(savedConversations);
      }
    } catch (recoveryError) {
      console.error('恢复对话列表失败:', recoveryError);
    }
  }
}

// 加载对话
function loadConversation(conversationId) {
  const conversation = conversations.find(c => c.id === conversationId);
  if (conversation) {
    currentConversation = conversation;
    messagesContainer.innerHTML = '';
    conversation.messages.forEach(msg => {
      const messageElement = createMessageElement(msg.content, msg.role === 'user');
      messagesContainer.appendChild(messageElement);
    });
    // 更新心情按钮状态
    moodButtons.forEach(btn => {
      if (btn.dataset.mood === conversation.mood) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    updateHistoryList();
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
}

// 保存对话到本地存储
function saveConversation() {
  try {
    if (!currentConversation) return;
    
    const index = conversations.findIndex(c => c.id === currentConversation.id);
    if (index === -1) {
      conversations.unshift(currentConversation); // 将新对话添加到开头
    } else {
      conversations[index] = currentConversation;
    }
    localStorage.setItem('conversations', JSON.stringify(conversations));
    updateHistoryList();
  } catch (error) {
    console.error('保存对话失败:', error);
  }
}

// 事件监听器
document.addEventListener('DOMContentLoaded', () => {
    sendButton.addEventListener('click', sendMessage);
    
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    moodButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            moodButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (currentConversation) {
                currentConversation.mood = btn.dataset.mood;
                saveConversation();
            }
        });
    });
    
    const newChatBtn = document.getElementById('newChatBtn');
    if (newChatBtn) {
        newChatBtn.addEventListener('click', createNewConversation);
    }
    
    if (moodAnalysisBtn && moodAnalysisContent) {
        moodAnalysisBtn.addEventListener('click', () => {
            moodAnalysisContent.classList.toggle('show');
            if (moodAnalysisContent.classList.contains('show')) {
                fetchMoodAnalysis();
            }
        });
    }
    
    fetchConversations();
    
    if (!currentConversation || !currentConversation.messages.length) {
        messagesContainer.innerHTML = `
            <div class="welcome-message">
                你好！我是你的AI生活教练。我可以帮助你提供生活建议、解决困扰、分享积极态度和情绪支持。请告诉我你现在的感受，我会根据你的心情提供相应的帮助。
            </div>
        `;
    }
});

// 自动调整输入框高度
messageInput.addEventListener('input', () => {
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 150) + 'px';
});

// 从后端获取历史对话
async function fetchConversations() {
  try {
    const response = await fetch('/api/conversations');
    if (response.ok) {
      const data = await response.json();
      // 只使用本地存储的对话列表
      const localConversations = JSON.parse(localStorage.getItem('conversations') || '[]');
      conversations = localConversations;
      updateHistoryList();
    }
  } catch (error) {
    console.error('获取历史对话失败:', error);
    // 如果获取失败，使用本地存储的历史对话
    const localConversations = JSON.parse(localStorage.getItem('conversations') || '[]');
    conversations = localConversations;
    updateHistoryList();
  }
}

// 获取心情分析总结
async function fetchMoodAnalysis() {
  try {
    console.log('开始获取心情分析...');
    const response = await fetch('/api/mood-analysis');
    console.log('收到响应:', response.status);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('心情分析数据:', data);
    
    if (!data || !data.moodData || !data.moodStats) {
      throw new Error('数据格式不正确');
    }
    
    displayMoodAnalysis(data);
  } catch (error) {
    console.error('获取心情分析失败:', error);
    moodAnalysisContent.innerHTML = `
      <div class="error-message">
        获取心情分析失败: ${error.message}<br>
        请确保服务器正在运行，并刷新页面重试。
      </div>
    `;
    moodAnalysisContent.classList.add('show');
  }
}

// 显示心情分析
function displayMoodAnalysis(data) {
  try {
    const { moodData, moodStats } = data;
    
    if (!moodData || !moodStats) {
      throw new Error('数据格式不正确');
    }
    
    // 计算心情分布
    const moodDistribution = moodStats.moodDistribution || {};
    const totalMessages = moodData.length;
    
    if (totalMessages === 0) {
      moodAnalysisContent.innerHTML = `
        <div class="no-data-message">
          暂无足够的数据进行心情分析。<br>
          请先进行一些对话后再查看分析。
        </div>
      `;
      moodAnalysisContent.classList.add('show');
      return;
    }
    
    // 生成心情分布文本
    const distributionText = Object.entries(moodDistribution)
      .map(([mood, count]) => {
        const percentage = ((count / totalMessages) * 100).toFixed(1);
        return `${mood}: ${percentage}%`;
      })
      .join('\n');
    
    // 生成分析总结
    const analysis = `
      心情分析总结：
      -----------------
      平均心情指数：${(moodStats.average * 100).toFixed(1)}%
      最常出现的心情：${moodStats.mostFrequent || '暂无数据'}
      
      心情分布：
      ${distributionText || '暂无数据'}
      
      建议：
      ${generateMoodAdvice(moodStats)}
    `;
    
    moodAnalysisContent.textContent = analysis;
    moodAnalysisContent.classList.add('show');
  } catch (error) {
    console.error('显示心情分析失败:', error);
    moodAnalysisContent.innerHTML = `
      <div class="error-message">
        显示心情分析失败: ${error.message}<br>
        请刷新页面重试。
      </div>
    `;
    moodAnalysisContent.classList.add('show');
  }
}

// 生成心情建议
function generateMoodAdvice(moodStats) {
  try {
    const average = moodStats.average || 0;
    if (average >= 0.7) {
      return '你的整体心情状态很好，继续保持这种积极乐观的态度！';
    } else if (average >= 0.5) {
      return '你的心情状态还算不错，但可以尝试做一些让自己开心的事情来提升心情。';
    } else if (average >= 0.3) {
      return '你最近的心情有些低落，建议多与朋友交流，或者尝试一些放松的活动。';
    } else {
      return '你最近的心情状态不太好，建议寻求专业帮助或与信任的人分享你的感受。';
    }
  } catch (error) {
    console.error('生成心情建议失败:', error);
    return '暂时无法生成心情建议，请稍后再试。';
  }
}

// 删除对话
function deleteConversation(conversationId) {
  if (confirm('确定要删除这个对话吗？此操作不可恢复。')) {
    try {
      // 从数组中移除对话
      conversations = conversations.filter(conv => conv.id !== conversationId);
      
      // 如果删除的是当前对话，清空消息区域并显示欢迎语
      if (currentConversation && conversationId === currentConversation.id) {
        messagesContainer.innerHTML = `
          <div class="welcome-message">
            你好！我是你的AI生活教练。我可以帮助你提供生活建议、解决困扰、分享积极态度和情绪支持。请告诉我你现在的感受，我会根据你的心情提供相应的帮助。
          </div>
        `;
        currentConversation = null;
      }
      
      // 保存到本地存储
      localStorage.setItem('conversations', JSON.stringify(conversations));
      
      // 更新界面
      updateHistoryList();
      
      // 重置心情按钮状态
      moodButtons.forEach(btn => {
        if (btn.dataset.mood === 'peaceful') {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    } catch (error) {
      console.error('删除对话失败:', error);
      alert('删除对话失败，请重试');
    }
  }
}

// 创建新对话
function createNewConversation() {
    currentConversation = {
        id: Date.now().toString(), // 确保ID是字符串
        title: '新对话',
        messages: [],
        mood: 'peaceful'
    };
    conversations.unshift(currentConversation);
    localStorage.setItem('conversations', JSON.stringify(conversations));
    
    // 清空消息区域并显示欢迎语
    messagesContainer.innerHTML = `
        <div class="welcome-message">
            你好！我是你的AI生活教练。我可以帮助你提供生活建议、解决困扰、分享积极态度和情绪支持。请告诉我你现在的感受，我会根据你的心情提供相应的帮助。
        </div>
    `;
    
    // 重置心情按钮状态
    moodButtons.forEach(btn => {
        if (btn.dataset.mood === 'peaceful') {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // 更新历史列表
    updateHistoryList();
}

// 测试服务器连接
async function testServerConnection() {
    try {
        // 测试健康检查端点
        const healthResponse = await fetch('/api/health');
        if (!healthResponse.ok) {
            throw new Error(`健康检查失败: ${healthResponse.status}`);
        }
        
        // 测试对话列表端点
        const conversationsResponse = await fetch('/api/conversations');
        if (!conversationsResponse.ok) {
            throw new Error(`对话列表获取失败: ${conversationsResponse.status}`);
        }
        
        console.log('服务器连接测试成功');
    } catch (error) {
        console.error('服务器连接测试失败:', error);
        showError(`服务器连接测试失败: ${error.message}\n请检查服务器是否正常运行。`);
    }
} 