
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleAIFileManager } = require('@google/generative-ai/server');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Configure Multer for file uploads
const uploadDir = 'uploads/';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}
const upload = multer({ dest: uploadDir });

// Read default rules
app.get('/api/rules', (req, res) => {
    const rulesPath = path.join(__dirname, 'rules.txt');
    fs.readFile(rulesPath, 'utf8', (err, data) => {
        if (err) {
            console.error("Error reading rules.txt:", err);
            // If file doesn't exist, return empty string or default message
            return res.json({ rules: "" });
        }
        res.json({ rules: data });
    });
});

// Check API Key status
const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

if (!apiKey) {
    console.error("CRITICAL ERROR: API Key (GEMINI_API_KEY or GOOGLE_API_KEY) is missing from .env file!");
} else if (apiKey === "YOUR_API_KEY_HERE") {
    console.error("CRITICAL ERROR: You have not replaced the placeholder YOUR_API_KEY_HERE in the .env file!");
} else {
    console.log(`API Key loaded: ${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)} (Length: ${apiKey.length})`);
}

// Initialize Gemini
const genAI = new GoogleGenerativeAI(apiKey);
const fileManager = new GoogleAIFileManager(apiKey);

app.get('/api/models', async (req, res) => {
    try {
        if (!apiKey) {
            console.error("API Key is missing in /api/models");
            return res.status(500).json({ error: "API Key is missing on server" });
        }
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (!response.ok) {
            throw new Error(`Failed to list models: ${response.statusText}`);
        }
        const data = await response.json();
        console.log("Raw models data received:", JSON.stringify(data).substring(0, 200) + "..."); // Log first 200 chars

        if (!data.models) {
            console.error("No 'models' property in response:", data);
            return res.json([]);
        }

        const models = data.models
            .filter(model => model.supportedGenerationMethods && model.supportedGenerationMethods.includes('generateContent'))
            .map(model => ({
                id: model.name.replace('models/', ''),
                name: model.displayName || model.name,
                description: model.description
            }))
            .sort((a, b) => b.id.localeCompare(a.id));

        console.log("Filtered models:", models.map(m => m.id));
        res.json(models);
    } catch (error) {
        console.error("Error listing models:", error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/summarize', upload.single('audio'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No audio file uploaded.' });
    }

    const rules = req.body.rules || "Summarize the key takeaways.";
    const modelId = req.body.model || "gemini-1.5-flash";
    const filePath = req.file.path;
    const mimeType = req.file.mimetype;

    try {
        const model = genAI.getGenerativeModel({ model: modelId });
        const uploadResult = await fileManager.uploadFile(filePath, {
            mimeType,
            displayName: req.file.originalname,
        });

        const fileUri = uploadResult.file.uri;
        console.log(`Uploaded file to Gemini: ${fileUri}`);

        // 2. Wait for the file to be active (processing)
        let file = await fileManager.getFile(uploadResult.file.name);
        while (file.state === "PROCESSING") {
            process.stdout.write(".");
            await new Promise((resolve) => setTimeout(resolve, 2000));
            file = await fileManager.getFile(uploadResult.file.name);
        }

        if (file.state === "FAILED") {
            throw new Error("Audio processing failed.");
        }

        console.log("\nFile processing complete.");

        // 3. Generate content
        // 3. Generate content
        const prompt = `
            Transcribe this audio file verbatim in the language spoken in the audio.
            Provide a summary in the same language based on the following rules:
            Rules: ${rules}
        `;

        const schema = {
            description: "Podcast transcription and summary",
            type: "object",
            properties: {
                transcript: {
                    type: "string",
                    description: "Full verbatim transcript of the audio file"
                },
                summary: {
                    type: "string",
                    description: "Summary of the podcast based on the provided rules"
                },
                language: {
                    type: "string",
                    description: "Detected language code (e.g., 'en', 'zh', 'ja')"
                }
            },
            required: ["transcript", "summary", "language"]
        };

        const result = await model.generateContent({
            contents: [
                {
                    role: 'user',
                    parts: [
                        {
                            fileData: {
                                mimeType: uploadResult.file.mimeType,
                                fileUri: uploadResult.file.uri
                            }
                        },
                        { text: prompt }
                    ]
                }
            ],
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: schema
            }
        });


        const responseText = result.response.text();
        // With responseMimeType: "application/json", the text should be valid JSON without markdown blocks.
        const jsonResponse = JSON.parse(responseText);

        res.json(jsonResponse);

        // Cleanup: Delete the file from Gemini and local upload
        // Note: For production, you might want to keep Gemini files for a bit or manage them differently.
        // We'll delete the local file immediately.
        fs.unlinkSync(filePath);

        // Optionally delete from Gemini
        // await fileManager.deleteFile(uploadResult.file.name);

    } catch (error) {
        console.error("Error processing request:", error);
        res.status(500).json({ error: error.message });
        // Cleanup local file on error
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
});

app.post('/api/translate', async (req, res) => {
    const { text, targetLanguage, model: modelId } = req.body;

    if (!text || !targetLanguage) {
        return res.status(400).json({ error: 'Text and targetLanguage are required.' });
    }

    try {
        const model = genAI.getGenerativeModel({ model: modelId || "gemini-1.5-flash" });
        const prompt = `
            Translate the following text to ${targetLanguage}. 
            Return the result as a raw JSON object with the key 'translatedText'.
            
            Text:
            ${text}
        `;

        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                responseMimeType: "application/json"
            }
        });
        const responseText = result.response.text();
        const jsonResponse = JSON.parse(responseText);

        res.json(jsonResponse);
    } catch (error) {
        console.error("Error translation:", error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
