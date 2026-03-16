const { PrismaClient } = require('c:/Users/User/agent-hub/node_modules/.pnpm/@prisma+client@6.19.2_prism_6b2b1af085fe6797f5a5ea830937a8e3/node_modules/@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: 'postgresql://agenthub:agenthub_pass@localhost:5432/agenthub' } } });

const TEMPLATES = [
  {
    name: 'Market Research',
    description: 'Comprehensive market analysis covering competitive landscape, customer segments, and opportunity sizing.',
    goal: 'Conduct thorough market research to understand the competitive landscape, identify target customer segments, and size the addressable market opportunity.',
    category: 'research',
    icon: '🔍',
    tasks: [
      { title: 'Data Collection & Source Identification', description: 'Identify and gather data from primary and secondary sources including industry reports, competitor websites, customer interviews, and market databases.', priority: 'HIGH', suggestedRole: 'Research Analyst', order: 0 },
      { title: 'Competitor Analysis', description: 'Map the competitive landscape — identify top 5-10 competitors, analyze their positioning, pricing, strengths and weaknesses, and market share.', priority: 'HIGH', suggestedRole: 'Research Analyst', order: 1 },
      { title: 'Customer Segment Profiling', description: 'Define and profile 3-5 key customer segments: demographics, jobs-to-be-done, pain points, buying behavior, and willingness to pay.', priority: 'MEDIUM', suggestedRole: 'Senior PM', order: 2 },
      { title: 'Market Sizing (TAM/SAM/SOM)', description: 'Calculate total addressable market, serviceable addressable market, and serviceable obtainable market using bottom-up and top-down methodologies.', priority: 'MEDIUM', suggestedRole: 'Financial Analyst', order: 3 },
      { title: 'SWOT Analysis & Strategic Recommendations', description: 'Synthesize research findings into a SWOT analysis and produce 3-5 strategic recommendations with supporting evidence.', priority: 'HIGH', suggestedRole: 'Strategy Consultant', order: 4 },
    ],
  },
  {
    name: 'Product Launch',
    description: 'End-to-end product launch plan from positioning through go-to-market execution and post-launch review.',
    goal: 'Plan and execute a successful product launch that achieves awareness, drives initial adoption, and establishes strong market positioning.',
    category: 'product',
    icon: '🚀',
    tasks: [
      { title: 'Market & Customer Research', description: 'Validate product-market fit, identify beachhead customer segment, and gather ICP (Ideal Customer Profile) data to inform launch messaging.', priority: 'CRITICAL', suggestedRole: 'Research Analyst', order: 0 },
      { title: 'Positioning & Messaging Framework', description: 'Develop product positioning statement, value proposition, key messages for each customer segment, and competitive differentiation narrative.', priority: 'CRITICAL', suggestedRole: 'Product Marketing Manager', order: 1 },
      { title: 'Go-to-Market Strategy', description: 'Define launch channels, partner strategy, pricing tiers, sales enablement materials, and launch timeline with milestones.', priority: 'HIGH', suggestedRole: 'Senior PM', order: 2 },
      { title: 'Content & PR Package', description: 'Write press release, blog post, social media copy, email sequences, and landing page copy for launch day.', priority: 'HIGH', suggestedRole: 'Content Writer', order: 3 },
      { title: 'Launch Metrics & Success Criteria', description: 'Define KPIs (signups, activation rate, revenue, NPS), set targets, and create a dashboard for tracking launch performance.', priority: 'MEDIUM', suggestedRole: 'Data Analyst', order: 4 },
      { title: 'Post-Launch Review', description: 'Analyze launch performance against targets, document lessons learned, and produce recommendations for iteration.', priority: 'MEDIUM', suggestedRole: 'Senior PM', order: 5 },
    ],
  },
  {
    name: 'Content Strategy',
    description: 'Build a data-driven content strategy with audience research, editorial calendar, and distribution plan.',
    goal: 'Develop a comprehensive content strategy that drives organic growth, establishes thought leadership, and converts target audience into customers.',
    category: 'marketing',
    icon: '✍️',
    tasks: [
      { title: 'Audience & Persona Research', description: 'Define 3 content personas, map their content consumption habits, preferred formats, key questions, and decision-making journey.', priority: 'HIGH', suggestedRole: 'Content Strategist', order: 0 },
      { title: 'SEO Keyword & Topic Research', description: 'Identify 50+ target keywords across awareness/consideration/decision stages, analyze search intent, and map to content clusters.', priority: 'HIGH', suggestedRole: 'SEO Specialist', order: 1 },
      { title: 'Competitive Content Audit', description: 'Analyze top 5 competitors content strategy — formats, publishing cadence, top-performing topics, and content gaps we can exploit.', priority: 'MEDIUM', suggestedRole: 'Research Analyst', order: 2 },
      { title: '90-Day Editorial Calendar', description: 'Create a 90-day content calendar with titles, formats, target keywords, CTAs, and assigned owners for each piece.', priority: 'HIGH', suggestedRole: 'Content Strategist', order: 3 },
      { title: 'Distribution & Amplification Plan', description: 'Map distribution channels (organic, paid, partnerships, email), create repurposing workflows, and set engagement targets per channel.', priority: 'MEDIUM', suggestedRole: 'Marketing Manager', order: 4 },
    ],
  },
  {
    name: 'Financial Analysis',
    description: 'Thorough financial analysis including cost breakdown, revenue modeling, and executive summary with recommendations.',
    goal: 'Perform a comprehensive financial analysis to understand current performance, identify cost optimization opportunities, and produce data-driven revenue projections.',
    category: 'finance',
    icon: '📊',
    tasks: [
      { title: 'Financial Data Collection & Cleaning', description: 'Gather all relevant financial data (P&L, balance sheet, cash flow, unit economics), validate accuracy, and prepare clean datasets for analysis.', priority: 'CRITICAL', suggestedRole: 'Financial Analyst', order: 0 },
      { title: 'Cost Structure Analysis', description: 'Break down all cost categories (COGS, OpEx, CapEx), identify top cost drivers, benchmark against industry averages, and flag optimization opportunities.', priority: 'HIGH', suggestedRole: 'Financial Analyst', order: 1 },
      { title: 'Revenue Modeling & Projections', description: 'Build 3-scenario revenue model (bear/base/bull) for 12-18 months, with assumptions documented and sensitivity analysis on key drivers.', priority: 'HIGH', suggestedRole: 'Financial Analyst', order: 2 },
      { title: 'Executive Summary & Recommendations', description: 'Synthesize analysis into a 1-page executive summary with key findings, top 3 risks, and 5 actionable recommendations prioritized by impact.', priority: 'HIGH', suggestedRole: 'CFO Advisor', order: 3 },
    ],
  },
  {
    name: 'Technical Audit',
    description: 'Systematic technical review covering architecture, security, performance, and code quality with actionable findings.',
    goal: 'Conduct a thorough technical audit to identify architectural risks, security vulnerabilities, performance bottlenecks, and code quality issues — producing a prioritized remediation roadmap.',
    category: 'engineering',
    icon: '🛡️',
    tasks: [
      { title: 'Architecture & Codebase Review', description: 'Evaluate system architecture, component dependencies, data flows, scalability constraints, and technical debt across the codebase.', priority: 'HIGH', suggestedRole: 'Senior Engineer', order: 0 },
      { title: 'Security Vulnerability Assessment', description: 'Scan for OWASP Top 10 vulnerabilities, review authentication/authorization patterns, secrets management, and dependency CVEs.', priority: 'CRITICAL', suggestedRole: 'Security Engineer', order: 1 },
      { title: 'Performance Profiling', description: 'Profile application performance — identify slow queries, memory leaks, render bottlenecks, and API latency hotspots. Benchmark against targets.', priority: 'HIGH', suggestedRole: 'Senior Engineer', order: 2 },
      { title: 'Infrastructure & DevOps Review', description: 'Audit CI/CD pipelines, deployment configuration, monitoring/alerting setup, disaster recovery procedures, and infrastructure costs.', priority: 'MEDIUM', suggestedRole: 'DevOps Engineer', order: 3 },
      { title: 'Remediation Roadmap', description: 'Produce a prioritized remediation roadmap with severity classifications, estimated effort, and recommended order of fixes. Include quick wins vs. long-term items.', priority: 'HIGH', suggestedRole: 'Engineering Lead', order: 4 },
    ],
  },
];

async function seed() {
  for (const tmpl of TEMPLATES) {
    const { tasks, ...rest } = tmpl;
    const existing = await prisma.projectTemplate.findFirst({ where: { name: rest.name, isBuiltIn: true } });
    if (existing) { console.log('Already exists:', rest.name); continue; }
    await prisma.projectTemplate.create({
      data: { ...rest, userId: null, isBuiltIn: true, tasks: { create: tasks } },
    });
    console.log('Created:', rest.name);
  }
}

seed()
  .then(() => { console.log('Done'); return prisma.$disconnect(); })
  .catch(e => { console.error(e.message); return prisma.$disconnect(); });
