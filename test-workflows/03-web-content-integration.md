# Web Content Integration Flow

## Overview
The workflow that enables users to provide URLs for websites they want to recreate, get inspiration from, or use as context for AI code generation. The system scrapes content locally without external API dependencies.

## User Journey

### Step 1: URL Input
**User Action**: Provides a website URL
**Examples**:
- "Recreate this landing page: https://example-startup.com"
- "Build something similar to https://dashboard.stripe.com"
- "Use this design as inspiration: https://dribbble.com/shots/12345"

**UI Integration**: URL input field or paste functionality in chat interface

### Step 2: Content Retrieval Strategy
**System Action**: Determine scraping approach
- **Implementation**: `app/api/scrape-url-enhanced/route.ts` (Task 3 ✅)
- **Decision Logic**:
  1. Try basic fetch() for static content first
  2. Fallback to Puppeteer for JavaScript-heavy sites
  3. Handle different content types appropriately

```javascript
// Scraping strategy example
const scrapingStrategy = await determineScrapeStrategy(url)
if (scrapingStrategy === 'static') {
  return await fetchStaticContent(url)
} else {
  return await puppeteerScrape(url)
}
```

### Step 3: Basic HTML Retrieval
**System Action**: Fetch content with Node.js fetch API
- **Implementation**: Task 3.1 ✅
- **Process**:
  1. Send HTTP request with proper headers
  2. Handle redirects and status codes
  3. Validate response content type
  4. Extract raw HTML content
  5. Handle network errors gracefully

```javascript
// Basic fetch implementation
const response = await fetch(url, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; OpenLovable/1.0)',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
  },
  timeout: 10000
})

if (!response.ok) {
  throw new Error(`HTTP ${response.status}: ${response.statusText}`)
}

const html = await response.text()
```

### Step 4: HTML Parsing and Content Extraction
**System Action**: Parse HTML and extract meaningful content
- **Implementation**: Cheerio integration (Task 3.2 ✅)
- **Process**:
  1. Load HTML into Cheerio DOM parser
  2. Extract main content using heuristics
  3. Remove navigation, ads, and footer elements
  4. Preserve important metadata
  5. Convert to markdown format

```javascript
// Cheerio content extraction
const $ = cheerio.load(html)

// Extract metadata
const title = $('title').text() || $('h1').first().text()
const description = $('meta[name="description"]').attr('content')
const ogImage = $('meta[property="og:image"]').attr('content')

// Extract main content
$('nav, .nav, header, footer, .footer, .sidebar, .ads').remove()
const mainContent = $('main, article, .content, .main-content').first()

// Convert to markdown
const markdown = htmlToMarkdown(mainContent.html())
```

### Step 5: JavaScript-Rendered Content Handling
**System Action**: Use Puppeteer for dynamic sites
- **Implementation**: Puppeteer integration (Task 3.3 ✅)
- **Process**:
  1. Launch headless Chrome browser
  2. Navigate to URL with wait strategies
  3. Wait for dynamic content to load
  4. Extract rendered HTML
  5. Optionally capture screenshots

```javascript
// Puppeteer dynamic content scraping
const browser = await puppeteer.launch({ headless: true })
const page = await browser.newPage()

await page.setViewport({ width: 1280, height: 720 })
await page.goto(url, { waitUntil: 'networkidle2' })

// Wait for specific elements if needed
await page.waitForSelector('.main-content', { timeout: 5000 })

// Extract content after JavaScript execution
const content = await page.evaluate(() => {
  return document.querySelector('main, .content, body').innerText
})

await browser.close()
```

### Step 6: Content Sanitization
**System Action**: Clean and sanitize extracted content
- **Implementation**: Content sanitization (Task 3.4 ✅)
- **Process**:
  1. Remove malicious scripts and iframes
  2. Convert smart quotes to straight quotes
  3. Handle Unicode characters properly
  4. Sanitize HTML while preserving formatting
  5. Apply XSS prevention measures

```javascript
// Content sanitization example
function sanitizeContent(content) {
  // Remove dangerous elements
  content = content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  content = content.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
  
  // Convert smart quotes
  content = content.replace(/[""]/g, '"')
  content = content.replace(/['']/g, "'")
  content = content.replace(/[—]/g, '--')
  
  // Handle other Unicode characters
  content = content.normalize('NFC')
  
  return content
}
```

### Step 7: Context Integration
**System Action**: Add scraped content to conversation context
- **Implementation**: Context management (Task 4.6 ✅)
- **Process**:
  1. Store scraped content with timestamp
  2. Associate with current conversation
  3. Include in AI prompt context
  4. Manage context window size limits
  5. Enable reference in subsequent prompts

### Step 8: AI Code Generation
**User Experience**: Use scraped content for code generation
- **Natural Language**: "Create a similar layout using React"
- **Specific Elements**: "Build that hero section with the gradient background"
- **Style Inspiration**: "Use those color choices and typography"

## Technical Implementation

### Scraping Pipeline Architecture

#### 1. Fetch Layer (Task 3.1 ✅)
```javascript
// app/api/scrape-url-enhanced/route.ts
export async function POST(request) {
  const { url } = await request.json()
  
  try {
    // Try basic fetch first
    const staticContent = await fetchWithTimeout(url, 10000)
    if (staticContent.length > 1000) {
      return processStaticContent(staticContent)
    }
    
    // Fallback to Puppeteer for minimal content
    return await puppeteerScrape(url)
  } catch (error) {
    return handleScrapingError(error, url)
  }
}
```

#### 2. Content Processing (Task 3.2 ✅)
```javascript
// Content extraction utilities
class ContentExtractor {
  extractMainContent($) {
    // Try semantic elements first
    let content = $('main, article').first()
    
    // Fallback to common class names
    if (!content.length) {
      content = $('.content, .main-content, .post-content').first()
    }
    
    // Remove unwanted elements
    content.find('nav, .nav, .sidebar, .ads, script').remove()
    
    return content
  }
  
  extractMetadata($) {
    return {
      title: $('title').text(),
      description: $('meta[name="description"]').attr('content'),
      ogTitle: $('meta[property="og:title"]').attr('content'),
      ogImage: $('meta[property="og:image"]').attr('content'),
      favicon: $('link[rel="icon"]').attr('href')
    }
  }
}
```

#### 3. Puppeteer Integration (Task 3.3 ✅)
```javascript
// Puppeteer scraping service
class PuppeteerScraper {
  async scrapeWithScreenshot(url) {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
    
    try {
      const page = await browser.newPage()
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
      
      await page.goto(url, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      })
      
      // Capture screenshot for visual reference
      const screenshot = await page.screenshot({
        fullPage: true,
        type: 'png'
      })
      
      // Extract content after rendering
      const content = await page.evaluate(() => {
        return {
          html: document.documentElement.outerHTML,
          text: document.body.innerText,
          title: document.title
        }
      })
      
      return { content, screenshot }
    } finally {
      await browser.close()
    }
  }
}
```

#### 4. Content Sanitization (Task 3.4 ✅)
```javascript
// Security and formatting utilities
class ContentSanitizer {
  sanitizeForAI(content) {
    // XSS prevention
    content = this.removeScripts(content)
    content = this.removeIframes(content)
    content = this.sanitizeAttributes(content)
    
    // Typography normalization
    content = this.normalizeQuotes(content)
    content = this.normalizeDashes(content)
    content = this.normalizeWhitespace(content)
    
    return content
  }
  
  removeScripts(content) {
    return content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  }
  
  normalizeQuotes(content) {
    return content
      .replace(/[""]/g, '"')    // Smart double quotes
      .replace(/['']/g, "'")    // Smart single quotes
      .replace(/…/g, '...')     // Ellipsis
  }
}
```

## Expected Inputs/Outputs

### Input Examples
```javascript
// Landing page request
{
  "url": "https://stripe.com",
  "context": "I want to build a similar payment processing landing page"
}

// Dashboard inspiration
{
  "url": "https://vercel.com/dashboard", 
  "context": "Create a dashboard with similar navigation and metrics cards"
}

// Design system reference
{
  "url": "https://tailwindui.com/components",
  "context": "Use these component patterns for my app"
}
```

### Output Examples
```javascript
// Scraped content structure
{
  "success": true,
  "url": "https://stripe.com",
  "metadata": {
    "title": "Stripe - Online payment processing for internet businesses",
    "description": "Stripe is a suite of payment APIs that powers commerce for online businesses of all sizes.",
    "ogImage": "https://stripe.com/img/social/default.png"
  },
  "content": {
    "markdown": "# Accept payments online\n\nMillions of companies use Stripe to accept payments...",
    "text": "Accept payments online. Millions of companies use Stripe...",
    "wordCount": 1247
  },
  "scrapedAt": "2025-01-15T10:30:00Z",
  "scrapeMethod": "fetch", // or "puppeteer"
  "processingTime": 1.2
}
```

### AI Context Integration
```markdown
## Scraped Website Context

**Source**: https://stripe.com (scraped 2 minutes ago)
**Description**: Payment processing landing page with clean design

### Key Elements Identified:
- Hero section with gradient background
- Product cards with icons and descriptions  
- Customer testimonials section
- Pricing table with feature comparison
- Clean navigation with dropdown menus

### Content Summary:
Stripe's landing page emphasizes trust, simplicity, and global reach for online payments. The design uses a blue and white color scheme with subtle gradients and modern typography.

---

**User Request**: Create a similar payment processing landing page for my SaaS product
```

## Error Scenarios

### 1. Invalid or Unreachable URL
**Issue**: User provides malformed URL or site is down
**Recovery**:
- URL validation before scraping attempt
- Clear error message with suggestions
- Option to retry or try alternative URL

```javascript
// Error handling example
try {
  await fetch(url)
} catch (error) {
  if (error.code === 'ENOTFOUND') {
    return { error: "Website not found. Please check the URL and try again." }
  } else if (error.code === 'ETIMEDOUT') {
    return { error: "Website took too long to respond. It may be temporarily unavailable." }
  }
}
```

### 2. Anti-Bot Protection
**Issue**: Website blocks scraping attempts
**Recovery**:
- Retry with different User-Agent headers
- Use Puppeteer with stealth mode
- Provide manual fallback option

### 3. JavaScript-Heavy Site Timeout
**Issue**: Puppeteer fails to load dynamic content
**Recovery**:
- Increase timeout limits
- Try different wait strategies
- Fall back to static content if available

### 4. Content Too Large
**Issue**: Scraped content exceeds context limits
**Recovery**:
- Truncate content intelligently
- Extract only main sections
- Summarize key elements

## Validation Criteria

### ✅ Success Indicators
1. **URL Accessible**: Can fetch content from provided URL
2. **Content Extracted**: Meaningful text and structure retrieved
3. **Metadata Captured**: Title, description, and key info extracted
4. **Context Integration**: Scraped content available for AI prompts
5. **Sanitization Applied**: No malicious content or formatting issues

### 🔧 Performance Expectations
- **Static Sites**: < 3 seconds for fetch and parse
- **Dynamic Sites**: < 15 seconds including Puppeteer
- **Large Pages**: < 30 seconds for comprehensive extraction
- **Context Integration**: < 1 second to add to conversation

### 🛡️ Security Validations
1. **XSS Prevention**: Scripts and iframes removed
2. **Content Sanitization**: No malicious markup preserved
3. **Input Validation**: URLs validated before processing
4. **Resource Limits**: Scraping timeouts and size limits

## Testing Scenarios

### Static Content Sites
1. **Simple Blog**: WordPress or static site generator
2. **Landing Page**: Marketing site with standard HTML
3. **Documentation**: GitHub Pages or similar

### Dynamic Content Sites  
1. **SPA Applications**: React/Vue apps with client rendering
2. **E-commerce**: Product pages with dynamic pricing
3. **Dashboards**: Admin interfaces with real-time data

### Edge Cases
1. **Redirects**: Multiple redirects and URL changes
2. **Large Pages**: Very long content or many images
3. **Protected Content**: Login-required or paywall sites
4. **International Sites**: Non-English content and character sets

### Error Conditions
1. **Network Failures**: Timeout and connection errors
2. **Invalid URLs**: Malformed or non-existent addresses
3. **Bot Detection**: Anti-scraping measures
4. **Content Parsing**: Malformed HTML or unexpected structure

## Use Case Examples

### Design Recreation
```
User: "Make a landing page like https://linear.app"
System: Scrapes Linear's homepage, extracts design patterns
AI: Generates React components with similar layout and styling
```

### Feature Inspiration
```
User: "Add a pricing table like https://notion.so/pricing"
System: Scrapes Notion's pricing page, analyzes table structure
AI: Creates pricing component with similar features and layout
```

### Content Reference
```
User: "Build a dashboard inspired by https://vercel.com/dashboard"
System: Scrapes dashboard, extracts navigation and card patterns
AI: Generates dashboard components with similar information architecture
```

## Dependencies

### Completed Tasks
- ✅ Task 3.1: Basic HTML Fetching with Node.js Fetch API
- ✅ Task 3.2: Cheerio for HTML Parsing and Markdown Conversion
- ✅ Task 3.3: Puppeteer for JavaScript-Rendered Content
- ✅ Task 3.4: Content Sanitization and Smart Quote Handling
- ✅ Task 4.6: Context Management (for integrating scraped content)

### System Requirements
- Node.js fetch API for HTTP requests
- Cheerio library for HTML parsing
- Puppeteer with Chrome/Chromium for dynamic content
- Content sanitization utilities
- Context management system

### Integration Points
- AI prompt formatting includes scraped content
- Context window management handles large scraped data
- File operations may save scraped content for reference
- UI displays scraped content preview and metadata

This workflow enables users to leverage existing web designs and content as inspiration or direct reference for AI-generated applications, bridging the gap between inspiration and implementation.