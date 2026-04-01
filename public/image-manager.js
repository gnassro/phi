/**
 * image-manager.js — Image Attachment Manager
 *
 * Handles image paste, file picker, and preview rendering.
 * Note: Drag-and-drop is not supported in VS Code webview iframes —
 * Electron intercepts file drops before they reach the webview.
 */

export class ImageManager {
  constructor(chatInput) {
    this.pendingImages = [];
    this.chatInput = chatInput;

    // DOM refs
    this.imagePreviews = document.getElementById('image-previews');
    this.imageInput = document.getElementById('image-input');
    this.attachBtn = document.getElementById('attach-btn');
    this.messageInput = chatInput.element;

    this._init();
  }

  _init() {
    // Wire paste handler on ChatInput
    this.chatInput.onImagePaste = async (files) => {
      for (const file of files) {
        const img = await this._processFile(file);
        if (img) this.pendingImages.push(img);
      }
      this._renderPreviews();
    };

    // Attach button
    this.attachBtn?.addEventListener('click', () => this.imageInput?.click());

    // File input change
    this.imageInput?.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      for (const file of files) {
        const img = await this._processFile(file);
        if (img) this.pendingImages.push(img);
      }
      this.imageInput.value = '';
      this._renderPreviews();
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

  _processFile(file) {
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
