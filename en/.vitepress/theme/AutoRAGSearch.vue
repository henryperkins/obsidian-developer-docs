<template>
  <div class="autorag-search">
    <button @click="showModal = true" class="search-button">
      <svg class="search-icon" width="20" height="20" viewBox="0 0 20 20">
        <path d="M14.386 14.386l4.0877 4.0877-4.0877-4.0877c-2.9418 2.9419-7.7115 2.9419-10.6533 0-2.9419-2.9418-2.9419-7.7115 0-10.6533 2.9418-2.9419 7.7115-2.9419 10.6533 0 2.9419 2.9418 2.9419 7.7115 0 10.6533z" stroke="currentColor" fill="none" fill-rule="evenodd" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span>Search with AI</span>
      <kbd>Ctrl+K</kbd>
    </button>

    <Teleport to="body">
      <div v-if="showModal" class="modal-overlay" @click="closeModal">
        <div class="modal-content" @click.stop>
          <div class="search-header">
            <input
              v-model="searchQuery"
              @keyup.enter="performSearch"
              placeholder="Ask a question about Obsidian development..."
              class="search-input"
              ref="searchInput"
              :disabled="loading"
            />
            <button @click="performSearch" class="search-submit" :disabled="loading || !searchQuery.trim()">
              <span v-if="loading">Searching...</span>
              <span v-else>Search</span>
            </button>
          </div>

          <div class="search-results" v-if="results || loading">
            <div v-if="loading" class="loading">
              <div class="spinner"></div>
              <p>Searching documentation...</p>
            </div>

            <div v-else-if="error" class="error">
              <p>{{ error }}</p>
            </div>

            <div v-else-if="results">
              <div v-if="results.response" class="ai-response">
                <h3>AI Response</h3>
                <div class="response-content" v-html="renderMarkdown(results.response)"></div>
              </div>

              <div v-if="results.data && results.data.length > 0" class="source-documents">
                <h3>Source Documents</h3>
                <div class="document" v-for="doc in results.data" :key="doc.file_id">
                  <div class="document-header">
                    <span class="document-title">{{ doc.filename }}</span>
                    <span class="document-score">{{ (doc.score * 100).toFixed(0) }}% match</span>
                  </div>
                  <div class="document-content">
                    <p v-for="content in doc.content" :key="content.id">
                      {{ content.text }}
                    </p>
                  </div>
                </div>
              </div>

              <div v-else class="no-results">
                <p>No matching documents found.</p>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button @click="closeModal" class="close-button">Close</button>
            <div class="shortcuts">
              <kbd>ESC</kbd> to close
              <kbd>Enter</kbd> to search
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'

const showModal = ref(false)
const searchQuery = ref('')
const results = ref(null)
const loading = ref(false)
const error = ref(null)
const searchInput = ref(null)

// Configurable API base: set VITE_AUTORAG_API_BASE for non-routed Workers
const API_BASE = import.meta.env.VITE_AUTORAG_API_BASE || ''
const AUTORAG_SEARCH_URL = API_BASE ? `${API_BASE}/autorag-search` : '/api/autorag-search'

const performSearch = async () => {
  if (!searchQuery.value.trim() || loading.value) return

  loading.value = true
  error.value = null
  results.value = null

  try {
    const response = await fetch(AUTORAG_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: searchQuery.value,
        max_num_results: 5,
        rewrite_query: true,
      }),
    })

    if (!response.ok) {
      throw new Error(`Search failed: ${response.statusText}`)
    }

    const data = await response.json()
    results.value = data
  } catch (err) {
    error.value = err.message || 'An error occurred while searching'
    console.error('Search error:', err)
  } finally {
    loading.value = false
  }
}

const renderMarkdown = (text) => {
  // Basic markdown rendering - you might want to use a proper markdown parser
  return text
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
}

const closeModal = () => {
  showModal.value = false
  searchQuery.value = ''
  results.value = null
  error.value = null
}

const handleKeydown = (e) => {
  // Ctrl+K or Cmd+K to open search
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    showModal.value = true
    nextTick(() => {
      searchInput.value?.focus()
    })
  }
  // ESC to close
  if (e.key === 'Escape' && showModal.value) {
    closeModal()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.autorag-search {
  display: inline-block;
}

.search-button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.search-button:hover {
  background: var(--vp-c-bg-soft-up);
  border-color: var(--vp-c-brand);
}

.search-icon {
  width: 20px;
  height: 20px;
}

kbd {
  padding: 2px 6px;
  font-size: 12px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-border);
  border-radius: 4px;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 100px;
  z-index: 100;
}

.modal-content {
  background: var(--vp-c-bg);
  border-radius: 12px;
  width: 90%;
  max-width: 800px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.search-header {
  padding: 20px;
  border-bottom: 1px solid var(--vp-c-border);
  display: flex;
  gap: 12px;
}

.search-input {
  flex: 1;
  padding: 12px;
  font-size: 16px;
  border: 1px solid var(--vp-c-border);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
}

.search-input:focus {
  outline: none;
  border-color: var(--vp-c-brand);
}

.search-submit {
  padding: 12px 24px;
  background: var(--vp-c-brand);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;
}

.search-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.search-results {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--vp-c-border);
  border-top-color: var(--vp-c-brand);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error {
  padding: 20px;
  background: var(--vp-c-danger-soft);
  border-radius: 8px;
  color: var(--vp-c-danger);
}

.ai-response {
  margin-bottom: 30px;
}

.ai-response h3 {
  margin-bottom: 12px;
  color: var(--vp-c-brand);
}

.response-content {
  padding: 16px;
  background: var(--vp-c-bg-soft);
  border-radius: 8px;
  line-height: 1.6;
}

.response-content p {
  margin: 12px 0;
}

.response-content code {
  padding: 2px 4px;
  background: var(--vp-c-bg-soft-up);
  border-radius: 4px;
}

.source-documents h3 {
  margin-bottom: 12px;
  color: var(--vp-c-text-2);
}

.document {
  margin-bottom: 16px;
  padding: 12px;
  background: var(--vp-c-bg-soft);
  border-radius: 8px;
  border: 1px solid var(--vp-c-border);
}

.document-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.document-title {
  font-weight: 500;
  color: var(--vp-c-brand);
  font-size: 14px;
}

.document-score {
  font-size: 12px;
  color: var(--vp-c-text-3);
}

.document-content {
  font-size: 14px;
  line-height: 1.5;
  color: var(--vp-c-text-2);
}

.no-results {
  text-align: center;
  padding: 40px;
  color: var(--vp-c-text-3);
}

.modal-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--vp-c-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.close-button {
  padding: 8px 16px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-border);
  border-radius: 6px;
  cursor: pointer;
}

.shortcuts {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--vp-c-text-3);
}
</style>
