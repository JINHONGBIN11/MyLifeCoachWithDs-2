// DOM元素
const timeRangeSelect = document.getElementById('timeRange');
const conversationSelect = document.getElementById('conversationSelect');
const averageMoodElement = document.getElementById('averageMood');
const mostFrequentMoodElement = document.getElementById('mostFrequentMood');
const moodChartCanvas = document.getElementById('moodChart');
const distributionChartCanvas = document.getElementById('distributionChart');

// 图表实例
let moodChart = null;
let distributionChart = null;

// 心情表情映射
const moodEmojis = {
    happy: '😊',
    excited: '🤩',
    peaceful: '😌',
    confused: '🤔',
    anxious: '😰',
    sad: '😢',
    angry: '😠',
    tired: '😫'
};

// 心情颜色映射
const moodColors = {
    happy: '#4CAF50',
    excited: '#FFC107',
    peaceful: '#2196F3',
    confused: '#9C27B0',
    anxious: '#FF5722',
    sad: '#607D8B',
    angry: '#F44336',
    tired: '#795548'
};

// 获取心情数据
async function fetchMoodData() {
    try {
        // 使用相对路径，适应不同环境
        const response = await fetch('/api/mood-analysis');
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('获取心情数据失败:', error);
        return null;
    }
}

// 过滤数据
function filterData(data, timeRange, conversationId) {
    let filteredData = [...data.moodData];
    
    // 按时间范围过滤
    if (timeRange !== 'all') {
        const now = Date.now();
        const ranges = {
            week: 7 * 24 * 60 * 60 * 1000,
            month: 30 * 24 * 60 * 60 * 1000,
            year: 365 * 24 * 60 * 60 * 1000
        };
        const timeLimit = now - ranges[timeRange];
        filteredData = filteredData.filter(item => item.timestamp >= timeLimit);
    }
    
    // 按对话ID过滤
    if (conversationId !== 'all') {
        filteredData = filteredData.filter(item => item.conversationId === conversationId);
    }
    
    return filteredData;
}

// 更新心情趋势图
function updateMoodChart(data) {
    const ctx = moodChartCanvas.getContext('2d');
    
    // 销毁现有图表
    if (moodChart) {
        moodChart.destroy();
    }
    
    // 准备数据
    const sortedData = data.sort((a, b) => a.timestamp - b.timestamp);
    const labels = sortedData.map(item => new Date(item.timestamp).toLocaleString());
    const scores = sortedData.map(item => item.score);
    
    // 创建新图表
    moodChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: '心情得分',
                data: scores,
                borderColor: '#2196F3',
                backgroundColor: 'rgba(33, 150, 243, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 1,
                    ticks: {
                        stepSize: 0.2
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const dataPoint = sortedData[context.dataIndex];
                            return `${moodEmojis[dataPoint.mood]} ${dataPoint.mood}`;
                        }
                    }
                }
            }
        }
    });
}

// 更新心情分布图
function updateDistributionChart(data) {
    const ctx = distributionChartCanvas.getContext('2d');
    
    // 销毁现有图表
    if (distributionChart) {
        distributionChart.destroy();
    }
    
    // 计算分布
    const distribution = {};
    data.forEach(item => {
        distribution[item.mood] = (distribution[item.mood] || 0) + 1;
    });
    
    // 准备数据
    const labels = Object.keys(distribution).map(mood => `${moodEmojis[mood]} ${mood}`);
    const counts = Object.values(distribution);
    
    // 创建新图表
    distributionChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: counts,
                backgroundColor: Object.keys(distribution).map(mood => moodColors[mood])
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right'
                }
            }
        }
    });
}

// 更新统计信息
function updateStats(data) {
    const average = data.reduce((acc, curr) => acc + curr.score, 0) / data.length;
    const moodCounts = {};
    data.forEach(item => {
        moodCounts[item.mood] = (moodCounts[item.mood] || 0) + 1;
    });
    const mostFrequent = Object.entries(moodCounts)
        .sort(([,a], [,b]) => b - a)[0][0];
    
    averageMoodElement.textContent = `${moodEmojis[mostFrequent]} ${mostFrequent}`;
    mostFrequentMoodElement.textContent = `${moodEmojis[mostFrequent]} ${mostFrequent}`;
}

// 更新对话选择器
function updateConversationSelect(conversations) {
    const uniqueConversations = [...new Set(conversations.map(item => item.conversationId))];
    conversationSelect.innerHTML = '<option value="all">所有对话</option>';
    
    uniqueConversations.forEach(id => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = `对话 ${id}`;
        conversationSelect.appendChild(option);
    });
}

// 初始化页面
async function initializePage() {
    const data = await fetchMoodData();
    if (data) {
        updateConversationSelect(data.moodData);
        const filteredData = filterData(data, timeRangeSelect.value, conversationSelect.value);
        updateMoodChart(filteredData);
        updateDistributionChart(filteredData);
        updateStats(filteredData);
    }
}

// 事件监听器
timeRangeSelect.addEventListener('change', async () => {
    const data = await fetchMoodData();
    if (data) {
        const filteredData = filterData(data, timeRangeSelect.value, conversationSelect.value);
        updateMoodChart(filteredData);
        updateDistributionChart(filteredData);
        updateStats(filteredData);
    }
});

conversationSelect.addEventListener('change', async () => {
    const data = await fetchMoodData();
    if (data) {
        const filteredData = filterData(data, timeRangeSelect.value, conversationSelect.value);
        updateMoodChart(filteredData);
        updateDistributionChart(filteredData);
        updateStats(filteredData);
    }
});

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', initializePage);