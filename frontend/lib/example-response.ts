/**
 * Example API Response Format for Fact-Check Agent
 * 
 * This file demonstrates the expected JSON structure that the backend
 * should return when analyzing a PDF document.
 * 
 * Use this as a reference when building your backend API endpoint.
 */

export const exampleResponse = {
  summary: {
    verified: 3,
    inaccurate: 2,
    false: 1,
  },
  claims: [
    {
      claim_text:
        "Our product increases productivity by 75% compared to competitors",
      status: "inaccurate",
      correct_fact:
        "Independent studies show an average productivity increase of 45-55%",
      sources: [
        {
          title: "TechReview 2024 Productivity Analysis",
          url: "https://techreview.com/studies/productivity-2024",
        },
        {
          title: "Industry Benchmark Report",
          url: "https://industrybench.org/reports/2024-q3",
        },
      ],
      explanation:
        "The claimed 75% improvement is higher than industry benchmarks. Independent testing shows our product performs at 50% above average, which aligns with 45-55% improvement range.",
    },
    {
      claim_text: "Founded in 2015 by tech entrepreneurs",
      status: "verified",
      correct_fact: null,
      sources: [
        {
          title: "Company Wikipedia",
          url: "https://en.wikipedia.org/wiki/example-company",
        },
      ],
      explanation: "Company records confirm founding date and founder information.",
    },
    {
      claim_text: "Our solution serves over 50,000 enterprise customers",
      status: "false",
      correct_fact: "As of latest reports, the company serves approximately 8,000 enterprise customers",
      sources: [
        {
          title: "Latest Annual Report",
          url: "https://investor.example.com/annual-reports/2024",
        },
        {
          title: "Verified Customer Database",
          url: "https://crunchbase.com/organization/example-company",
        },
      ],
      explanation:
        "The 50,000 customer claim significantly exceeds the actual enterprise customer count. Official annual reports show 8,000 enterprise customers as of Q3 2024.",
    },
    {
      claim_text:
        "The platform uses end-to-end encryption for all data transfers",
      status: "verified",
      correct_fact: null,
      sources: [
        {
          title: "Security Whitepaper",
          url: "https://example.com/security/whitepaper",
        },
        {
          title: "SOC 2 Type II Certification",
          url: "https://example.com/compliance/soc2",
        },
      ],
      explanation:
        "Verified through security documentation and third-party security audits.",
    },
    {
      claim_text:
        "Reduces operational costs by up to 60% within the first year",
      status: "inaccurate",
      correct_fact:
        "Average customer savings are 25-35% in year one, reaching 40-50% by year three",
      sources: [
        {
          title: "Customer ROI Case Studies",
          url: "https://example.com/customers/case-studies",
        },
        {
          title: "Third-Party ROI Analysis",
          url: "https://analyticsfirm.com/roi-reports/example-product",
        },
      ],
      explanation:
        "While some customers achieve 60% savings in specific use cases, the average is lower. Most customers see 25-35% cost reduction in year one.",
    },
    {
      claim_text: "We have zero security breaches in our 9-year history",
      status: "false",
      correct_fact:
        "One security incident was reported in 2019 affecting 500 users, which was disclosed and resolved",
      sources: [
        {
          title: "Security Incident Disclosure",
          url: "https://example.com/security/incident-2019",
        },
        {
          title: "News Archive",
          url: "https://news.site.com/example-security-incident",
        },
      ],
      explanation:
        "Records show a security incident in 2019. While the company has maintained strong security since then, claiming zero breaches is inaccurate.",
    },
  ],
};

/**
 * Test your backend integration with this example.
 * 
 * When implementing the `/analyze` endpoint:
 * 1. Accept a PDF file via multipart/form-data
 * 2. Extract claims from the PDF using your NLP/document processing pipeline
 * 3. Verify each claim against live data sources (web search, databases, etc.)
 * 4. Return the structured response matching this format
 * 
 * The frontend expects:
 * - HTTP 200 on success
 * - HTTP 4xx/5xx on error (frontend will show error message)
 * - JSON response matching the AnalysisResult type
 */

export type ApiResponse = {
  summary: {
    verified: number;
    inaccurate: number;
    false: number;
  };
  claims: Array<{
    claim_text: string;
    status: "verified" | "inaccurate" | "false";
    correct_fact: string | null;
    sources: Array<{
      title: string;
      url: string;
    }>;
    explanation: string;
  }>;
};
