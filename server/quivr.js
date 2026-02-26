const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

class QuivrClient {
  constructor(apiKey, baseUrl = 'https://api.quivr.app') {
    if (!apiKey) {
      console.warn('QuivrClient initialized without API key. Quivr features will fail.');
    }
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Accept': 'application/json'
      }
    });
  }

  async createBrain(name) {
    try {
      console.log(`Creating Quivr brain: ${name}`);
      const response = await this.client.post('/brains/', {
        name: name,
        description: 'Created by D&D AI Assistant',
        status: 'private'
      });
      console.log('Brain created:', response.data);
      return response.data; // Expecting { id: "...", ... }
    } catch (error) {
      console.error('Error creating brain:', error.response?.data || error.message);
      throw error;
    }
  }

  async uploadFile(brainId, filePath, mimeType) {
    try {
      console.log(`Uploading file to brain ${brainId}: ${filePath}`);
      const form = new FormData();
      form.append('uploadFile', fs.createReadStream(filePath));

      // Quivr upload endpoint usually expects query param brain_id
      const response = await this.client.post(`/upload?brain_id=${brainId}`, form, {
        headers: {
          ...form.getHeaders()
        }
      });
      console.log('File uploaded:', response.data);
      return response.data;
    } catch (error) {
      console.error('Error uploading file:', error.response?.data || error.message);
      throw error;
    }
  }

  async createChat(name) {
    try {
      console.log(`Creating Quivr chat: ${name}`);
      const response = await this.client.post('/chat', {
        name: name
      });
      console.log('Chat created:', response.data);
      return response.data; // Expecting { chat_id: "...", ... }
    } catch (error) {
      console.error('Error creating chat:', error.response?.data || error.message);
      throw error;
    }
  }

  async chat(chatId, message, brainId) {
    try {
      console.log(`Sending message to chat ${chatId} with brain ${brainId}`);
      // Endpoint typically /chat/{chat_id}/question
      const response = await this.client.post(`/chat/${chatId}/question`, {
        question: message,
        brain_id: brainId
      });

      // Response format depends on Quivr version, often { assistant: "...", ... } or { answer: "..." }
      // We'll log it to be sure during debug
      console.log('Chat response received');
      return response.data;
    } catch (error) {
      console.error('Error in chat:', error.response?.data || error.message);
      throw error;
    }
  }
}

module.exports = QuivrClient;
