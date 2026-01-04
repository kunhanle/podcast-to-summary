
import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import './App.css'

function App() {
  const [file, setFile] = useState(null)
  const [rules, setRules] = useState('')
  const [models, setModels] = useState([])
  const [selectedModel, setSelectedModel] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const [originalData, setOriginalData] = useState(null)
  const [viewLanguage, setViewLanguage] = useState('original') // 'original' or 'en'
  const [translating, setTranslating] = useState(false)

  useEffect(() => {
    // Fetch models
    fetch('/api/models')
      .then(res => res.json())
      .then(data => {
        setModels(data)
        if (data.length > 0) {
          setSelectedModel(data[0].id)
        }
      })
      .catch(err => console.error('Failed to fetch models:', err))

    // Fetch default rules
    fetch('/api/rules')
      .then(res => res.json())
      .then(data => {
        if (data.rules) {
          setRules(data.rules)
        }
      })
      .catch(err => console.error('Failed to fetch rules:', err))
  }, [])

  const handleFileChange = (e) => {
    if (e.target.files) {
      setFile(e.target.files[0])
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file) {
      setError('Please select a file first.')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)
    setOriginalData(null)
    setViewLanguage('original')

    const formData = new FormData()
    formData.append('audio', file)
    formData.append('rules', rules)
    formData.append('model', selectedModel)

    try {
      const response = await fetch('/api/summarize', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || 'Failed to process request')
      }

      const data = await response.json()
      setResult(data)
      setOriginalData(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleTranslate = async (targetLang) => {
    if (!originalData) return;

    if (targetLang === 'original') {
      setResult(originalData);
      setViewLanguage('original');
      return;
    }

    setTranslating(true);
    try {
      // Translate Transcript
      const transcriptRes = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: originalData.transcript,
          targetLanguage: targetLang,
          model: selectedModel
        })
      });
      const transcriptData = await transcriptRes.json();

      // Translate Summary
      const summaryRes = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: originalData.summary,
          targetLanguage: targetLang,
          model: selectedModel
        })
      });
      const summaryData = await summaryRes.json();

      setResult({
        transcript: transcriptData.translatedText,
        summary: summaryData.translatedText,
      });
      setViewLanguage(targetLang);

    } catch (err) {
      console.error("Translation error", err);
      setError("Translation failed: " + err.message);
    } finally {
      setTranslating(false);
    }
  }

  return (
    <div className="container">
      <header>
        <h1>Podcast Summarizer</h1>
        <p>Upload a podcast MP3, set your rules, and get a transcript + summary.</p>
      </header>

      <section className="input-section">
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="audio-upload" className="file-upload-label">
              {file ? file.name : 'Choose MP3 File'}
            </label>
            <input
              id="audio-upload"
              type="file"
              accept=".mp3,audio/mpeg"
              onChange={handleFileChange}
              className="file-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="model-select">Select Model</label>
            <select
              id="model-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="model-select"
            >
              {models.map(model => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Summarization Rules</label>
            <textarea
              value={rules}
              onChange={(e) => setRules(e.target.value)}
              placeholder="E.g., Focus on key technical details, or Summarize in 3 bullet points..."
              rows={3}
            />
          </div>

          <button type="submit" disabled={loading || !file} className="submit-btn">
            {loading ? 'Processing...' : 'Generate Summary'}
          </button>
        </form>
        {error && <div className="error">{error}</div>}
      </section>

      {loading && (
        <div className="loading-indicator">
          <div className="spinner"></div>
          <p>Transcribing and Summarizing... This may take a minute.</p>
        </div>
      )}

      {translating && (
        <div className="loading-indicator">
          <p>Translating...</p>
        </div>
      )}

      {result && (
        <div className="results-container">
          <div className="controls">
            <span>Language: </span>
            <button
              disabled={viewLanguage === 'original' || translating}
              onClick={() => handleTranslate('original')}>
              Original
            </button>
            <button
              disabled={viewLanguage === 'English' || translating}
              onClick={() => handleTranslate('English')}>
              Translate to English
            </button>
            <button
              disabled={viewLanguage === 'Chinese' || translating}
              onClick={() => handleTranslate('Chinese')}>
              Translate to Chinese
            </button>
          </div>
          <div className="result-column transcript-column">
            <h2>Transcript</h2>
            <div className="content-box">
              <p>{result.transcript}</p>
            </div>
          </div>
          <div className="result-column summary-column">
            <h2>Summary</h2>
            <div className="content-box markdown-body">
              <ReactMarkdown>{result.summary}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
