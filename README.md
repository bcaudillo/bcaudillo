# Fivetran Sales Buddy - Chrome Extension

A quick-reference tool for your sales team to access troubleshooting guides, connector info, and talking points without leaving their browser.

## Features

✅ **Search** - Type to find answers instantly  
✅ **Browse Categories** - Connectors, Errors & Troubleshooting, ODI, Data Anomalies, Pricing  
✅ **Error Code Reference** - Understand HTTP status codes (400, 401, 403, 404, 422, 429, 5xx) and root causes  
✅ **Diagnostic Framework** - The "Big 3" troubleshooting checklist for any Fivetran issue  
✅ **One-Click Answers** - Expand any item to see detailed explanations  
✅ **Non-Technical Design** - Simple, clear language for your whole team  

## Installation

### Step 1: Prepare the Extension Files

1. Download or copy all extension files to a folder on your computer:
   ```
   fivetran-sales-buddy/
   ├── manifest.json
   ├── popup.html
   ├── popup.css
   ├── popup.js
   ├── data.js
   └── images/ (optional: place icon files here)
   ```

### Step 2: Load into Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer Mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the `fivetran-sales-buddy` folder
5. The extension should appear in your extensions list

### Step 3: Pin to Toolbar (Optional)

1. Click the puzzle icon 🧩 in Chrome toolbar
2. Find "Fivetran Sales Buddy"
3. Click the pin icon to pin it to your toolbar for quick access

## Usage

1. Click the extension icon in your Chrome toolbar
2. **Search**: Type any question in the search bar (e.g., "MySQL to Databricks", "what is ODI")
3. **Browse**: Click category tabs (Connectors, Troubleshooting, etc.) to explore
4. **Expand**: Click any item to see the full answer

## Adding/Editing Content

Content is stored in `data.js`. Each entry has:
- `id` - Unique identifier
- `category` - One of: connectors, troubleshooting, odi, data-anomalies, pricing
- `question` - The main question
- `preview` - Short one-liner
- `answer` - Full HTML answer with tips and scripts

### Example: Adding a New Item

```javascript
{
  id: 11,
  category: "troubleshooting",
  question: "What should I do if a sync times out?",
  preview: "Handling sync timeout errors",
  answer: `
    <div class="answer-section">
      <strong>Common Causes:</strong>
      <ul>
        <li>Source database is very large (10M+ rows)</li>
        <li>Network latency or connection issues</li>
        <li>Destination warehouse is slow to accept writes</li>
      </ul>
    </div>
    // ... more HTML
  `
}
```

Add to the `knowledgeBase` array in `data.js` and reload the extension in Chrome.

## Updating the Extension

After editing `data.js` or other files:
1. Go to `chrome://extensions/`
2. Find "Fivetran Sales Buddy"
3. Click the refresh icon 🔄

Your changes appear immediately.

## What's Included

- **10+ FAQs** covering:
  - MySQL & PostgreSQL connector setup
  - Databricks integration troubleshooting
  - ODI (On-Demand Ingestion) explainers
  - Data anomaly diagnosis
  - Pricing models and cost optimization
  
- **Talking Points** for each answer - ready to use in customer calls
- **Code Examples** for common API calls and database commands

## Tips for Your Team

- **Bookmarks**: Teach team members to pin the extension to their toolbar
- **Search First**: Searching is faster than browsing categories
- **Copy-Paste Friendly**: Code blocks and scripts can be copied directly to email/Slack
- **Customize**: Add your team's specific scenarios to the knowledge base

## Support

To add new content or update existing items:
1. Edit `data.js`
2. Add to the `knowledgeBase` array
3. Reload the extension in Chrome

Questions? Customize the content to match your team's most common call scenarios.

---

**Version:** 1.0  
**Last Updated:** April 2026  
**Status:** Ready for your team to use
