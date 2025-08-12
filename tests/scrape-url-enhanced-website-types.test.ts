import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/scrape-url-enhanced/route';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock console to avoid noise in tests
const mockConsole = vi.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

describe('scrape-url-enhanced website type tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createMockRequest = (url: string) => {
    return new NextRequest('http://localhost:3000/api/scrape-url-enhanced', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
  };

  const createMockResponse = (html: string, status: number = 200, contentType: string = 'text/html; charset=utf-8') => {
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      headers: new Map([['content-type', contentType]]),
      text: () => Promise.resolve(html),
    } as Response;
  };

  describe('Blog and article websites', () => {
    it('should scrape typical blog post structure', async () => {
      const blogHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title>How to Build Better Web Apps - Tech Blog</title>
          <meta name="description" content="Learn the best practices for building modern web applications with React and Next.js">
          <meta name="author" content="Jane Smith">
          <meta name="keywords" content="web development, react, nextjs, programming">
          <meta property="article:published_time" content="2023-06-15T10:00:00Z">
          <meta property="article:author" content="Jane Smith">
          <meta property="og:title" content="How to Build Better Web Apps">
          <meta property="og:description" content="Learn the best practices for building modern web applications">
          <meta property="og:image" content="https://blog.example.com/images/web-apps.jpg">
          <meta property="og:type" content="article">
        </head>
        <body>
          <header>
            <nav>
              <ul>
                <li><a href="/">Home</a></li>
                <li><a href="/about">About</a></li>
                <li><a href="/blog">Blog</a></li>
              </ul>
            </nav>
          </header>
          
          <main>
            <article>
              <header>
                <h1>How to Build Better Web Apps</h1>
                <p class="meta">By <span class="author">Jane Smith</span> on <time datetime="2023-06-15">June 15, 2023</time></p>
              </header>
              
              <div class="content">
                <p>Building modern web applications requires understanding several key principles and best practices.</p>
                
                <h2>1. Performance Optimization</h2>
                <p>Performance is crucial for user experience. Consider these optimizations:</p>
                <ul>
                  <li>Code splitting and lazy loading</li>
                  <li>Image optimization</li>
                  <li>Caching strategies</li>
                  <li>Bundle size optimization</li>
                </ul>
                
                <h2>2. Accessibility</h2>
                <p>Make your apps accessible to all users:</p>
                <ol>
                  <li>Use semantic HTML</li>
                  <li>Provide proper ARIA labels</li>
                  <li>Ensure keyboard navigation works</li>
                  <li>Test with screen readers</li>
                </ol>
                
                <h3>Code Example</h3>
                <pre><code>
                  function AccessibleButton({ onClick, children }) {
                    return (
                      &lt;button onClick={onClick} aria-label="Submit form"&gt;
                        {children}
                      &lt;/button&gt;
                    );
                  }
                </code></pre>
                
                <blockquote>
                  "Accessibility is not a feature. It's a fundamental aspect of web development." - Web Standards Expert
                </blockquote>
                
                <p>For more information, check out the <a href="https://developer.mozilla.org/docs">MDN documentation</a>.</p>
              </div>
              
              <footer>
                <div class="tags">
                  <span>Tags:</span>
                  <a href="/tag/web-development">#webdev</a>
                  <a href="/tag/react">#react</a>
                  <a href="/tag/performance">#performance</a>
                </div>
              </footer>
            </article>
          </main>
          
          <aside>
            <h3>Related Articles</h3>
            <ul>
              <li><a href="/react-tips">React Tips and Tricks</a></li>
              <li><a href="/css-grid">Mastering CSS Grid</a></li>
            </ul>
          </aside>
          
          <footer>
            <p>&copy; 2023 Tech Blog. All rights reserved.</p>
          </footer>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce(createMockResponse(blogHtml));

      const request = createMockRequest('https://blog.example.com/better-web-apps');
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      
      // Check metadata extraction
      expect(data.structured.title).toBe('How to Build Better Web Apps - Tech Blog');
      expect(data.structured.description).toBe('Learn the best practices for building modern web applications with React and Next.js');
      expect(data.metadata.author).toBe('Jane Smith');
      expect(data.metadata.keywords).toBe('web development, react, nextjs, programming');
      expect(data.metadata.publishedTime).toBe('2023-06-15T10:00:00Z');
      expect(data.metadata.image).toBe('https://blog.example.com/images/web-apps.jpg');
      
      // Check content conversion
      expect(data.content).toContain('# How to Build Better Web Apps');
      expect(data.content).toContain('## 1. Performance Optimization');
      expect(data.content).toContain('## 2. Accessibility');
      expect(data.content).toContain('### Code Example');
      expect(data.content).toContain('- Code splitting and lazy loading');
      expect(data.content).toContain('1. Use semantic HTML');
      expect(data.content).toContain('MDN documentation');
      expect(data.content).toContain('Building modern web applications');
      
      // Should contain footer content since we extract all visible text
      expect(data.content).toContain('© 2023 Tech Blog. All rights reserved');
    });

    it('should handle news article with complex structure', async () => {
      const newsHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Breaking: Major Tech Announcement - News Site</title>
          <meta name="description" content="Tech company announces revolutionary new product">
          <meta property="og:title" content="Breaking: Major Tech Announcement">
          <meta property="og:type" content="article">
          <meta property="article:published_time" content="2023-06-15T14:30:00Z">
          <meta name="twitter:card" content="summary_large_image">
          <meta name="twitter:title" content="Breaking: Major Tech Announcement">
          <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "NewsArticle",
            "headline": "Major Tech Announcement",
            "author": {"@type": "Person", "name": "Tech Reporter"}
          }
          </script>
        </head>
        <body>
          <div class="breaking-banner">BREAKING NEWS</div>
          
          <article>
            <h1>Major Tech Company Announces Revolutionary Product</h1>
            <div class="article-meta">
              <span class="date">June 15, 2023 2:30 PM EST</span>
              <span class="author">By Tech Reporter</span>
            </div>
            
            <p class="lead">In a surprise announcement today, the tech giant revealed their latest innovation that could change the industry.</p>
            
            <div class="article-body">
              <p>The announcement came during a press conference held at the company's headquarters...</p>
              
              <h2>Key Features</h2>
              <ul>
                <li>Advanced AI integration</li>
                <li>Improved user interface</li>
                <li>Enhanced security features</li>
              </ul>
              
              <div class="quote-box">
                <blockquote>
                  "This represents a major leap forward in our technology capabilities," said the CEO.
                </blockquote>
              </div>
              
              <h2>Market Impact</h2>
              <p>Industry analysts predict this could have significant implications...</p>
            </div>
          </article>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce(createMockResponse(newsHtml));

      const request = createMockRequest('https://news.example.com/tech-announcement');
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.content).toContain('# Major Tech Company Announces Revolutionary Product');
      expect(data.content).toContain('## Key Features');
      expect(data.content).toContain('## Market Impact');
      expect(data.content).toContain('- Advanced AI integration');
      expect(data.content).toContain('This represents a major leap forward');
    });
  });

  describe('E-commerce websites', () => {
    it('should scrape product page structure', async () => {
      const productHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Premium Wireless Headphones - Electronics Store</title>
          <meta name="description" content="High-quality wireless headphones with noise cancellation and 30-hour battery life">
          <meta property="og:title" content="Premium Wireless Headphones">
          <meta property="og:description" content="High-quality wireless headphones">
          <meta property="og:image" content="https://shop.example.com/images/headphones.jpg">
          <meta property="og:price:amount" content="299.99">
          <meta property="og:price:currency" content="USD">
          <meta property="product:brand" content="AudioTech">
        </head>
        <body>
          <nav class="breadcrumb">
            <a href="/">Home</a> > <a href="/electronics">Electronics</a> > <a href="/headphones">Headphones</a>
          </nav>
          
          <main>
            <div class="product">
              <h1>Premium Wireless Headphones</h1>
              <div class="price">$299.99</div>
              <div class="rating">★★★★☆ (4.5/5) - 1,234 reviews</div>
              
              <div class="product-details">
                <h2>Product Description</h2>
                <p>Experience superior sound quality with our premium wireless headphones featuring:</p>
                
                <h3>Key Features</h3>
                <ul>
                  <li>Active noise cancellation</li>
                  <li>30-hour battery life</li>
                  <li>Quick charge: 5 minutes = 3 hours playback</li>
                  <li>Premium leather ear cups</li>
                  <li>Bluetooth 5.0 connectivity</li>
                </ul>
                
                <h3>Technical Specifications</h3>
                <table>
                  <tr><td>Driver Size</td><td>40mm</td></tr>
                  <tr><td>Frequency Response</td><td>20Hz - 20kHz</td></tr>
                  <tr><td>Weight</td><td>250g</td></tr>
                  <tr><td>Charging Port</td><td>USB-C</td></tr>
                </table>
                
                <h3>What's in the Box</h3>
                <ol>
                  <li>Premium Wireless Headphones</li>
                  <li>USB-C charging cable</li>
                  <li>3.5mm audio cable</li>
                  <li>Carrying case</li>
                  <li>Quick start guide</li>
                </ol>
              </div>
              
              <div class="reviews-summary">
                <h2>Customer Reviews</h2>
                <p>Based on 1,234 verified purchases</p>
                <div class="review-highlight">
                  <blockquote>"Amazing sound quality and comfort!" - Verified Buyer</blockquote>
                </div>
              </div>
            </div>
          </main>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce(createMockResponse(productHtml));

      const request = createMockRequest('https://shop.example.com/premium-headphones');
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.structured.title).toBe('Premium Wireless Headphones - Electronics Store');
      expect(data.content).toContain('# Premium Wireless Headphones');
      expect(data.content).toContain('## Product Description');
      expect(data.content).toContain('### Key Features');
      expect(data.content).toContain('### Technical Specifications');
      expect(data.content).toContain('- Active noise cancellation');
      expect(data.content).toContain('1. Premium Wireless Headphones');
      expect(data.content).toContain('$299.99');
      expect(data.content).toContain('Amazing sound quality and comfort!');
    });
  });

  describe('Documentation and knowledge base websites', () => {
    it('should scrape API documentation structure', async () => {
      const docsHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>API Reference - Authentication | DevDocs</title>
          <meta name="description" content="Complete reference for authentication endpoints in our REST API">
        </head>
        <body>
          <div class="sidebar">
            <nav>
              <ul>
                <li><a href="/docs/getting-started">Getting Started</a></li>
                <li><a href="/docs/authentication" class="active">Authentication</a></li>
                <li><a href="/docs/endpoints">Endpoints</a></li>
              </ul>
            </nav>
          </div>
          
          <main class="content">
            <h1>Authentication</h1>
            
            <p class="intro">Our API uses API keys for authentication. Include your API key in the Authorization header.</p>
            
            <div class="section">
              <h2>Getting Your API Key</h2>
              <p>To obtain an API key:</p>
              <ol>
                <li>Sign in to your dashboard</li>
                <li>Navigate to the API section</li>
                <li>Click "Generate New Key"</li>
                <li>Copy your key securely</li>
              </ol>
            </div>
            
            <div class="section">
              <h2>Using API Keys</h2>
              <p>Include your API key in requests:</p>
              
              <div class="code-example">
                <h3>Example Request</h3>
                <pre><code class="language-bash">
curl -H "Authorization: Bearer YOUR_API_KEY" \\
     -H "Content-Type: application/json" \\
     https://api.example.com/v1/users
                </code></pre>
              </div>
              
              <div class="code-example">
                <h3>JavaScript Example</h3>
                <pre><code class="language-javascript">
const response = await fetch('https://api.example.com/v1/users', {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  }
});
                </code></pre>
              </div>
            </div>
            
            <div class="section">
              <h2>Error Responses</h2>
              <p>Authentication errors return the following status codes:</p>
              
              <table class="error-table">
                <thead>
                  <tr><th>Status Code</th><th>Error</th><th>Description</th></tr>
                </thead>
                <tbody>
                  <tr><td>401</td><td>Unauthorized</td><td>Invalid or missing API key</td></tr>
                  <tr><td>403</td><td>Forbidden</td><td>API key lacks required permissions</td></tr>
                  <tr><td>429</td><td>Rate Limited</td><td>Too many requests</td></tr>
                </tbody>
              </table>
            </div>
            
            <div class="note warning">
              <h3>⚠️ Important</h3>
              <p>Never expose your API key in client-side code. Keep it secure on your server.</p>
            </div>
            
            <div class="next-steps">
              <h2>Next Steps</h2>
              <ul>
                <li><a href="/docs/endpoints">Explore API Endpoints</a></li>
                <li><a href="/docs/rate-limits">Learn About Rate Limits</a></li>
                <li><a href="/docs/webhooks">Set Up Webhooks</a></li>
              </ul>
            </div>
          </main>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce(createMockResponse(docsHtml));

      const request = createMockRequest('https://docs.example.com/authentication');
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.content).toContain('# Authentication');
      expect(data.content).toContain('## Getting Your API Key');
      expect(data.content).toContain('## Using API Keys');
      expect(data.content).toContain('### Example Request');
      expect(data.content).toContain('### JavaScript Example');
      expect(data.content).toContain('1. Sign in to your dashboard');
      expect(data.content).toContain('curl -H "Authorization: Bearer YOUR_API_KEY"');
      expect(data.content).toContain('Never expose your API key in client-side code');
    });
  });

  describe('Landing pages and marketing websites', () => {
    it('should scrape typical landing page structure', async () => {
      const landingHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Revolutionary Project Management Tool | TaskFlow</title>
          <meta name="description" content="Streamline your workflow with TaskFlow - the all-in-one project management solution trusted by 10,000+ teams">
          <meta property="og:title" content="Revolutionary Project Management Tool">
          <meta property="og:description" content="Streamline your workflow with TaskFlow">
          <meta property="og:image" content="https://taskflow.com/images/hero.jpg">
        </head>
        <body>
          <header>
            <nav class="navbar">
              <div class="logo">TaskFlow</div>
              <ul class="nav-menu">
                <li><a href="#features">Features</a></li>
                <li><a href="#pricing">Pricing</a></li>
                <li><a href="#testimonials">Testimonials</a></li>
                <li><a href="#contact">Contact</a></li>
              </ul>
              <div class="nav-buttons">
                <a href="/login" class="btn-secondary">Sign In</a>
                <a href="/signup" class="btn-primary">Start Free Trial</a>
              </div>
            </nav>
          </header>
          
          <section class="hero">
            <h1>Revolutionize Your Project Management</h1>
            <p class="hero-subtitle">TaskFlow helps teams collaborate better, track progress effortlessly, and deliver projects on time.</p>
            <div class="hero-cta">
              <a href="/signup" class="btn-large">Start Your Free 14-Day Trial</a>
              <p class="cta-note">No credit card required • Setup in 2 minutes</p>
            </div>
          </section>
          
          <section id="features" class="features">
            <h2>Everything You Need to Manage Projects</h2>
            
            <div class="feature-grid">
              <div class="feature">
                <h3>Smart Task Management</h3>
                <p>Organize, prioritize, and track tasks with intelligent automation and custom workflows.</p>
              </div>
              
              <div class="feature">
                <h3>Real-Time Collaboration</h3>
                <p>Work together seamlessly with instant updates, comments, and file sharing.</p>
              </div>
              
              <div class="feature">
                <h3>Advanced Analytics</h3>
                <p>Get insights into team performance, project timelines, and resource allocation.</p>
              </div>
              
              <div class="feature">
                <h3>Integration Hub</h3>
                <p>Connect with 100+ tools including Slack, GitHub, Google Drive, and more.</p>
              </div>
            </div>
          </section>
          
          <section class="stats">
            <h2>Trusted by Industry Leaders</h2>
            <div class="stat-items">
              <div class="stat">
                <div class="stat-number">10,000+</div>
                <div class="stat-label">Active Teams</div>
              </div>
              <div class="stat">
                <div class="stat-number">1M+</div>
                <div class="stat-label">Projects Completed</div>
              </div>
              <div class="stat">
                <div class="stat-number">99.9%</div>
                <div class="stat-label">Uptime</div>
              </div>
            </div>
          </section>
          
          <section id="testimonials" class="testimonials">
            <h2>What Our Customers Say</h2>
            
            <div class="testimonial">
              <blockquote>
                "TaskFlow transformed how our team works. We've increased productivity by 40% and never miss deadlines anymore."
              </blockquote>
              <div class="testimonial-author">
                <strong>Sarah Johnson</strong>, Project Manager at TechCorp
              </div>
            </div>
            
            <div class="testimonial">
              <blockquote>
                "The best project management tool we've ever used. The interface is intuitive and the features are powerful."
              </blockquote>
              <div class="testimonial-author">
                <strong>Mike Chen</strong>, CTO at StartupXYZ
              </div>
            </div>
          </section>
          
          <section id="pricing" class="pricing">
            <h2>Simple, Transparent Pricing</h2>
            
            <div class="pricing-plans">
              <div class="plan">
                <h3>Starter</h3>
                <div class="price">$9<span>/month per user</span></div>
                <ul class="plan-features">
                  <li>Up to 10 projects</li>
                  <li>Basic task management</li>
                  <li>5GB storage</li>
                  <li>Email support</li>
                </ul>
                <a href="/signup?plan=starter" class="btn-plan">Start Free Trial</a>
              </div>
              
              <div class="plan featured">
                <h3>Professional</h3>
                <div class="price">$19<span>/month per user</span></div>
                <ul class="plan-features">
                  <li>Unlimited projects</li>
                  <li>Advanced workflows</li>
                  <li>50GB storage</li>
                  <li>Priority support</li>
                  <li>Analytics dashboard</li>
                </ul>
                <a href="/signup?plan=professional" class="btn-plan">Start Free Trial</a>
              </div>
              
              <div class="plan">
                <h3>Enterprise</h3>
                <div class="price">Custom</div>
                <ul class="plan-features">
                  <li>Everything in Professional</li>
                  <li>SSO integration</li>
                  <li>Custom integrations</li>
                  <li>Dedicated support</li>
                  <li>SLA guarantee</li>
                </ul>
                <a href="/contact?plan=enterprise" class="btn-plan">Contact Sales</a>
              </div>
            </div>
          </section>
          
          <section class="cta-final">
            <h2>Ready to Transform Your Project Management?</h2>
            <p>Join thousands of teams already using TaskFlow to deliver better results.</p>
            <a href="/signup" class="btn-large">Start Your Free Trial Today</a>
          </section>
          
          <footer>
            <div class="footer-content">
              <div class="footer-section">
                <h4>Product</h4>
                <ul>
                  <li><a href="/features">Features</a></li>
                  <li><a href="/pricing">Pricing</a></li>
                  <li><a href="/integrations">Integrations</a></li>
                </ul>
              </div>
              <div class="footer-section">
                <h4>Support</h4>
                <ul>
                  <li><a href="/help">Help Center</a></li>
                  <li><a href="/api">API Docs</a></li>
                  <li><a href="/contact">Contact Us</a></li>
                </ul>
              </div>
              <div class="footer-section">
                <h4>Company</h4>
                <ul>
                  <li><a href="/about">About Us</a></li>
                  <li><a href="/careers">Careers</a></li>
                  <li><a href="/privacy">Privacy Policy</a></li>
                </ul>
              </div>
            </div>
            <div class="footer-bottom">
              <p>&copy; 2023 TaskFlow Inc. All rights reserved.</p>
            </div>
          </footer>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce(createMockResponse(landingHtml));

      const request = createMockRequest('https://taskflow.com');
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.content).toContain('# Revolutionize Your Project Management');
      expect(data.content).toContain('## Everything You Need to Manage Projects');
      expect(data.content).toContain('### Smart Task Management');
      expect(data.content).toContain('### Real-Time Collaboration');
      expect(data.content).toContain('## Trusted by Industry Leaders');
      expect(data.content).toContain('## What Our Customers Say');
      expect(data.content).toContain('## Simple, Transparent Pricing');
      expect(data.content).toContain('TaskFlow transformed how our team works');
      expect(data.content).toContain('10,000+');
      expect(data.content).toContain('$9');
      expect(data.content).toContain('Sarah Johnson');
    });
  });

  describe('Special content types and encodings', () => {
    it('should handle UTF-8 content with international characters', async () => {
      const internationalHtml = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <title>Café Internacional - Noticias</title>
          <meta name="description" content="Las mejores noticias de café de todo el mundo">
        </head>
        <body>
          <h1>Bienvenidos al Café Internacional</h1>
          <p>Descubre los mejores cafés de América Latina, incluyendo:</p>
          <ul>
            <li>Café colombiano de las montañas de los Andes</li>
            <li>Café brasileño de São Paulo</li>
            <li>Café costarricense de Tarrazú</li>
            <li>Café guatemalteco de Huehuetenango</li>
          </ul>
          
          <h2>Precios Especiales</h2>
          <p>Ofertas disponibles en €, $, £, ¥, y más monedas.</p>
          
          <h2>Reseñas de Clientes</h2>
          <blockquote>
            "¡Excelente calidad! Los granos tienen un sabor único y auténtico."
          </blockquote>
          
          <div class="french-content">
            <h3>Contenu en Français</h3>
            <p>Nous proposons également du café français de première qualité.</p>
          </div>
          
          <div class="german-content">
            <h3>Deutsche Inhalte</h3>
            <p>Wir bieten auch erstklassigen deutschen Kaffee an.</p>
          </div>
          
          <div class="symbols">
            <p>Símbolos especiales: ©®™ • ≤≥ ±× ÷ → ← ↑ ↓ ♠♣♥♦ ♪♫</p>
          </div>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce(createMockResponse(internationalHtml));

      const request = createMockRequest('https://cafe.ejemplo.com');
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.content).toContain('Bienvenidos al Café Internacional');
      expect(data.content).toContain('São Paulo');
      expect(data.content).toContain('Tarrazú');
      expect(data.content).toContain('Huehuetenango');
      expect(data.content).toContain('€, $, £, ¥');
      expect(data.content).toContain('Français');
      expect(data.content).toContain('Deutsche');
      expect(data.content).toContain('©®™');
      expect(data.content).toContain('♠♣♥♦');
    });

    it('should handle pages with mixed content and formatting', async () => {
      const mixedContentHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Mixed Content Test Page</title>
          <meta name="description" content="A page with various content types and formatting">
        </head>
        <body>
          <h1>Mixed Content Test</h1>
          
          <div class="prose">
            <p>This page contains <strong>various</strong> types of <em>formatted</em> content.</p>
            <p>Including <code>inline code</code> and <mark>highlighted text</mark>.</p>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>Feature</th>
                <th>Supported</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>HTML Tables</td>
                <td>✓ Yes</td>
                <td>Fully supported</td>
              </tr>
              <tr>
                <td>CSS Styling</td>
                <td>⚠ Partial</td>
                <td>Content only</td>
              </tr>
              <tr>
                <td>JavaScript</td>
                <td>✗ No</td>
                <td>Stripped out</td>
              </tr>
            </tbody>
          </table>
          
          <div class="code-block">
            <h3>Code Example</h3>
            <pre><code>
function example() {
  console.log("This code should be preserved");
  return {
    status: "success",
    data: [1, 2, 3]
  };
}
            </code></pre>
          </div>
          
          <dl>
            <dt>Definition List</dt>
            <dd>This is a definition list item</dd>
            <dt>Another Term</dt>
            <dd>With another definition</dd>
          </dl>
          
          <div class="nested-content">
            <div class="level-1">
              <h4>Nested Content</h4>
              <div class="level-2">
                <p>Multiple levels of nesting should be handled properly.</p>
                <div class="level-3">
                  <span>Deep nesting test</span>
                </div>
              </div>
            </div>
          </div>
          
          <script>
            // This script should be removed
            alert("This should not appear in scraped content");
          </script>
          
          <style>
            /* This style should be removed */
            body { color: red; }
          </style>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce(createMockResponse(mixedContentHtml));

      const request = createMockRequest('https://test.example.com/mixed');
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.content).toContain('# Mixed Content Test');
      expect(data.content).toContain('#### Nested Content');
      expect(data.content).toContain('various types of formatted content');
      expect(data.content).toContain('inline code');
      expect(data.content).toContain('console.log("This code should be preserved")');
      expect(data.content).toContain('Multiple levels of nesting');
      expect(data.content).toContain('Deep nesting test');
      
      // Should not contain script or style content
      expect(data.content).not.toContain('alert("This should not appear');
      expect(data.content).not.toContain('color: red');
      expect(data.content).not.toContain('<script>');
      expect(data.content).not.toContain('<style>');
    });

    it('should handle minimal HTML pages', async () => {
      const minimalHtml = `
        <html>
        <head><title>Minimal Page</title></head>
        <body>
          <p>Simple content.</p>
          <a href="https://example.com">Link</a>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce(createMockResponse(minimalHtml));

      const request = createMockRequest('https://minimal.example.com');
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.structured.title).toBe('Minimal Page');
      expect(data.content).toContain('Simple content.');
      expect(data.content).toContain('[Link](https://example.com)');
    });

    it('should handle pages with only metadata and no body content', async () => {
      const metadataOnlyHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Metadata Only Page</title>
          <meta name="description" content="A page with comprehensive metadata but minimal body content">
          <meta name="keywords" content="metadata, test, minimal">
          <meta name="author" content="Test Author">
          <meta property="og:title" content="Rich Metadata Page">
          <meta property="og:description" content="Testing metadata extraction">
          <meta property="og:image" content="https://example.com/image.jpg">
        </head>
        <body>
          <p>Minimal content.</p>
        </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce(createMockResponse(metadataOnlyHtml));

      const request = createMockRequest('https://metadata.example.com');
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.structured.title).toBe('Metadata Only Page');
      expect(data.structured.description).toBe('A page with comprehensive metadata but minimal body content');
      expect(data.metadata.keywords).toBe('metadata, test, minimal');
      expect(data.metadata.author).toBe('Test Author');
      expect(data.metadata.image).toBe('https://example.com/image.jpg');
      expect(data.content).toContain('Minimal content.');
    });
  });
});