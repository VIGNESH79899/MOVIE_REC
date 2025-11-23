// static/js/chatbot.js

let chatHistory = []; // { role: 'user' | 'bot', text: string }

function getChatStorageKey() {
    const name = window.currentUserName || 'guest';
    return `cineflix_chat_${name}`;
}

function loadChatHistory() {
    const container = document.getElementById('chatbot-messages');
    if (!container) return;

    container.innerHTML = '';

    let raw;
    try {
        raw = localStorage.getItem(getChatStorageKey());
    } catch {
        raw = null;
    }

    if (!raw) {
        // No history -> start with greeting
        const greeting = {
            role: 'bot',
            text: "Hi! I'm your CineFlix assistant. Ask me anything about movies! 🎬"
        };
        chatHistory = [greeting];
    } else {
        try {
            chatHistory = JSON.parse(raw) || [];
            if (!Array.isArray(chatHistory) || chatHistory.length === 0) {
                chatHistory = [{
                    role: 'bot',
                    text: "Hi! I'm your CineFlix assistant. Ask me anything about movies! 🎬"
                }];
            }
        } catch {
            chatHistory = [{
                role: 'bot',
                text: "Hi! I'm your CineFlix assistant. Ask me anything about movies! 🎬"
            }];
        }
    }

    chatHistory.forEach(msg => {
        addMessageToChat(msg.text, msg.role, false);
    });

    scrollChatToBottom();
}

function saveChatHistory() {
    try {
        localStorage.setItem(getChatStorageKey(), JSON.stringify(chatHistory));
    } catch (err) {
        console.warn('Could not save chat history:', err);
    }
}

// Toggle chatbot window
function toggleChatbot() {
    const chatWindow = document.getElementById('chatbot-window');
    if (!chatWindow) return;

    const isOpen = chatWindow.classList.toggle('active');
    if (isOpen) {
        loadChatHistory();
        const input = document.getElementById('chatbot-input');
        if (input) input.focus();
    }
}

// Send message
async function sendMessage() {
    const input = document.getElementById('chatbot-input');
    if (!input) return;

    const message = input.value.trim();
    if (!message) return;

    addMessageToChat(message, 'user', true);
    input.value = '';

    const typingId = addTypingIndicator();

    try {
        const response = await fetch('/api/chatbot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        });

        const data = await response.json();
        removeTypingIndicator(typingId);

        addMessageToChat(data.response || 'Sorry, I could not reply.', 'bot', true);
    } catch (error) {
        console.error('Error sending message:', error);
        removeTypingIndicator(typingId);
        addMessageToChat('Sorry, I encountered an error. Please try again.', 'bot', true);
    }
}

// Add message to chat
function addMessageToChat(message, sender, persist) {
    const messagesContainer = document.getElementById('chatbot-messages');
    if (!messagesContainer) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = sender === 'user' ? 'user-message' : 'bot-message';

    const messageText = document.createElement('p');
    messageText.textContent = message;

    messageDiv.appendChild(messageText);
    messagesContainer.appendChild(messageDiv);

    if (persist) {
        chatHistory.push({ role: sender, text: message });
        saveChatHistory();
    }

    scrollChatToBottom();
}

function scrollChatToBottom() {
    const messagesContainer = document.getElementById('chatbot-messages');
    if (!messagesContainer) return;
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Typing indicator
function addTypingIndicator() {
    const messagesContainer = document.getElementById('chatbot-messages');
    if (!messagesContainer) return null;

    const typingDiv = document.createElement('div');
    typingDiv.className = 'bot-message typing-indicator';
    typingDiv.id = 'typing-' + Date.now();

    const messageText = document.createElement('p');
    messageText.textContent = '...';
    typingDiv.appendChild(messageText);

    messagesContainer.appendChild(typingDiv);
    scrollChatToBottom();
    return typingDiv.id;
}

function removeTypingIndicator(id) {
    const indicator = document.getElementById(id);
    if (indicator) indicator.remove();
}

// Enter key to send
document.addEventListener('DOMContentLoaded', () => {
    const chatInput = document.getElementById('chatbot-input');
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
    }

    // Pre-load chat history (so when user opens, it's ready)
    loadChatHistory();
});