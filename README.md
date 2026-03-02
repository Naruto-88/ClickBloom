# ClickBloom: Premium AI-Assisted SEO Platform

ClickBloom is a professional SaaS platform designed to audit, optimize, and monitor SEO performance with AI-driven insights. It provides a seamless bridge between analytics and execution.

## 💎 Core Functions & Features

### 1. AI-Assisted Site Audit & Crawling
- **High-Velocity Crawler**: A custom-built engine with 10x concurrency (10 parallel pages) for rapid site analysis.
- **Automated Technical SEO**: Scans for Title tags, Meta descriptions, Canonical tags, H1 usage, word count, and Image Alt text.
- **Issue Prioritization**: Automatically categorizes findings into Critical Errors, Warnings, and Notices.

### 2. SEO Health Engine
- **Dynamic Scoring**: Real-time health scoring (0-100) using a complex weighted algorithm across technical, content, and metadata layers.
- **Progress Tracking**: Visual progress bars to monitor the resolution of identified SEO issues.

### 3. Internal Link Discovery
- **Intelligent Engine**: An automated feature that identifies missing internal link opportunities based on keyword extraction and cross-page pattern matching.
- **Automated Suggestions**: Provides specific source/target page pairs and anchor text suggestions.

### 4. Search Performance Analytics
- **GSC Integration**: Real-time integration with Google Search Console.
- **KPI Dashboards**: Advanced visualization of Clicks, Impressions, CTR, and Average Position.
- **Historical Comparison**: Direct period-over-period performance analysis with automated trend indicators.
- **Geographic & Keyword Distribution**: Specialized heatmaps and charts for deep-dive regional and keyword performance analysis.

### 5. AI-Powered Optimizations
- **Suggested Improvements**: AI-generated titles, meta descriptions, and image alt text based on page content.
- **Direct Application**: Ability to apply optimizations through integrated workflows.

### 6. Premium UI/UX Experience
- **Deep Space Theme**: A professional visual aesthetic featuring glassmorphism, refined Inter typography, and custom SVG iconography.
- **Micro-Animations**: Subtle pulse effects and fade-in-scale transitions for a modern SaaS feel.
- **Responsive Layout**: Fully optimized for both desktop and mobile work.

## 🛠 Tech Stack
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Auth**: NextAuth.js (Google OAuth)
- **Styling**: Vanilla CSS (Global Design System)
- **Scraping**: Cheerio

## 🚀 Getting Started
1. **Environment Setup**: Copy `.env.example` to `web/.env.local` and fill in Google OAuth and NextAuth credentials.
2. **Installation**: Run `npm install` in the `web/` directory.
3. **Dev Mode**: Start the development server with `npm run dev`.

## 🔌 WordPress Integration
- Install the **ClickBloom Connector** plugin on your site.
- Connect your site via the ClickBloom dashboard using your endpoint and secure token.
- Apply SEO optimizations directly from ClickBloom to your live WordPress posts.

---
*ClickBloom - Skyrocket your organic traffic in minutes, not months.*
