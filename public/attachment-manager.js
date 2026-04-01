/**
 * attachment-manager.js — File Attachment Manager
 *
 * Handles image paste, file picker, and preview rendering.
 * - Images: processed in-browser (paste or file picker) as base64 previews.
 * - Non-image files: the extension host opens a native file picker and adds
 *   the selected files as context references in the chat input.
 *
 * Note: Drag-and-drop is not supported in VS Code webview iframes —
 * Electron intercepts file drops before they reach the webview.
 */

import { VscodeIPC } from './vscode-ipc.js';

export class AttachmentManager {
  constructor(chatInput) {
    this.pendingImages = [];
    this.chatInput = chatInput;

    // DOM refs
    this.imagePreviews = document.getElementById('image-previews');
    this.fileInput = document.getElementById('file-input');
    this.attachBtn = document.getElementById('attach-btn');
    this.messageInput = chatInput.element;

    this._init();
  }

  _init() {
    // Wire paste handler on ChatInput
    this.chatInput.onImagePaste = async (files) => {
      for (const file of files) {
        const img = await this._processImage(file);
        if (img) this.pendingImages.push(img);
      }
      this._renderPreviews();
    };

    // Attach button — open native VS Code file picker via IPC
    this.attachBtn?.addEventListener('click', () => {
      VscodeIPC.send({ type: 'open_file_picker' });
    });

    // File input (hidden, used for image-only picking if needed in the future)
    this.fileInput?.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      for (const file of files) {
        if (file.type.startsWith('image/')) {
          const img = await this._processImage(file);
          if (img) this.pendingImages.push(img);
        }
      }
      this.fileInput.value = '';
      this._renderPreviews();
    });

    // Listen for image attachments from the extension host (e.g. image files picked)
    VscodeIPC.on('add_image_attachment', (msg) => {
      if (msg.data && msg.mimeType) {
        this.pendingImages.push({
          data: msg.data,
          mimeType: msg.mimeType,
          previewUrl: `data:${msg.mimeType};base64,${msg.data}`
        });
        this._renderPreviews();
      }
    });
  }

  /** Get images formatted for IPC send */
  getImages() {
    return this.pendingImages.map(img => ({
      type: 'image', data: img.data, mimeType: img.mimeType || 'image/png'
    }));
  }

  /** Clear all pending images */
  clearImages() {
    this.pendingImages = [];
    this._renderPreviews();
  }

  /** Check if there are pending images */
  hasPending() {
    return this.pendingImages.length > 0;
  }

  _processImage(file) {
    return new Promise((resolve) => {
      if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          const MAX = 2048;
          if (width > MAX || height > MAX) {
            const scale = MAX / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          const mimeType = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
          const quality = mimeType === 'image/jpeg' ? 0.85 : undefined;
          const base64 = canvas.toDataURL(mimeType, quality).split(',')[1];
          resolve(base64 ? { data: base64, mimeType } : null);
        };
        img.onerror = () => resolve(null);
        img.src = ev.target.result;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  _renderPreviews() {
    this.imagePreviews.innerHTML = '';
    if (this.pendingImages.length === 0) {
      this.imagePreviews.classList.add('hidden');
      return;
    }
    this.imagePreviews.classList.remove('hidden');
    this.pendingImages.forEach((img, i) => {
      const el = document.createElement('div');
      el.className = 'image-preview';
      el.innerHTML = `
        <img src="data:${img.mimeType};base64,${img.data}" />
        <button class="image-preview-remove" data-index="${i}">✕</button>
      `;
      el.querySelector('.image-preview-remove').addEventListener('click', () => {
        this.pendingImages.splice(i, 1);
        this._renderPreviews();
      });
      this.imagePreviews.appendChild(el);
    });
  }
}
