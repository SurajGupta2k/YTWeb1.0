# TubeSort

> Organize YouTube Content Your Way. A modern YouTube content manager with smart categorization.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## ✨ Features

- 🎥 **Smart Content Loading**: Easily load videos from any YouTube channel or playlist
- 🤖 **AI Categorization**: Automatically organize videos using Google's Gemini AI
- 🌓 **Theme Switching**: Sleek dark and light mode support
- 🔍 **Advanced Search**: Powerful search and filtering capabilities
- 📊 **Flexible Sorting**: Organize by date, views, and more
- 💾 **Fast Loading**: MongoDB caching for quick access
- 📱 **Responsive Design**: Works beautifully on all devices
- 🔄 **API Management**: Smart rotation of YouTube API keys

## 🛠️ Tech Stack

- **Frontend**: HTML, CSS (Tailwind CSS), Vanilla JavaScript
- **Backend**: Node.js, Express.js
- **Database**: MongoDB
- **APIs**: YouTube Data API v3, Google Gemini API

## 📋 Prerequisites

Before you begin, ensure you have:
- Node.js (v14 or higher)
- MongoDB database
- YouTube Data API key(s)
- Google Gemini API key

## 🚀 Quick Start

1. **Clone the repository**
   ```bash
   git clone [your-repo-url]
   cd tubesort
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file:
   ```env
   MONGODB_URI=your_mongodb_connection_string
   YOUTUBE_API_KEYS=key1,key2,key3
   GEMINI_API_KEY=your_gemini_api_key
   PORT=3000  # Optional, defaults to 3000
   ```

4. **Start developing**
   ```bash
   npm run dev
   ```

## 📝 Available Scripts

- `npm start` - Run in production mode
- `npm run dev` - Development mode with hot reload
- `npm run lint` - ESLint code checking
- `npm test` - Run tests (to be implemented)

## 📁 Project Structure

```
tubesort/
├── public/                 # Static assets
│   ├── css/
│   │   └── styles.css     # Tailwind & custom styles
│   ├── js/
│   │   ├── config.js      # API configuration
│   │   ├── script.js      # Core application logic
│   │   └── theme.js       # Theme switcher
│   └── index.html         # Main HTML
├── src/
│   └── server.js          # Express backend
├── .env                   # Environment config
├── .gitignore            # Git ignore rules
└── package.json          # Project metadata
```

## 🔧 Configuration

### Environment Variables
| Variable | Description | Required |
|----------|-------------|----------|
| `MONGODB_URI` | MongoDB connection URL | Yes |
| `YOUTUBE_API_KEYS` | YouTube API key(s) | Yes |
| `GEMINI_API_KEY` | Gemini AI API key | Yes |
| `PORT` | Server port number | No |

## 🌟 Usage

1. Visit `http://localhost:3000` in your browser
2. Enter a YouTube channel/playlist URL
3. Use TubeSort's features:
   - Switch between videos and live streams
   - Sort by various metrics
   - Search through content
   - Use AI categorization
   - Toggle dark/light theme

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
