// Funnel Application State
const state = {
  selectedPackage: 'Pro Architecture Bundle',
  basePrice: 47,
  hasOrderBump: false,
  bumpPrice: 17,
  currentStep: 1,
  customerName: '',
  customerEmail: ''
};

// Snippet library for hero preview tabs
const codeSnippets = {
  tab1: `<span class="code-comment">// 🚀 Autonomous Multi-Agent Orchestrator (Included in Pro Bundle)</span>
<span class="code-keyword">import</span> { AgentEngine, ToolRegistry } <span class="code-keyword">from</span> <span class="code-str">'@devbits/agent-core'</span>;

<span class="code-keyword">export async function</span> <span class="code-func">runProductionPipeline</span>(userPrompt: <span class="code-str">string</span>) {
  <span class="code-keyword">const</span> registry = <span class="code-keyword">new</span> ToolRegistry({ telemetry: <span class="code-str">'enabled'</span> });
  <span class="code-keyword">const</span> engine = <span class="code-keyword">new</span> AgentEngine({ model: <span class="code-str">'gemini-3.6-flash'</span>, memory: <span class="code-str">'vector'</span> });
  
  <span class="code-keyword">return await</span> engine.<span class="code-func">solveGoal</span>(userPrompt, { maxSteps: 10, autoRetry: <span class="code-keyword">true</span> });
}`,
  tab2: `<span class="code-comment">// 🛠️ Model Context Protocol (MCP) Express Server</span>
<span class="code-keyword">import</span> { Server } <span class="code-keyword">from</span> <span class="code-str">'@modelcontextprotocol/sdk/server/index.js'</span>;
<span class="code-keyword">import</span> { StdioServerTransport } <span class="code-keyword">from</span> <span class="code-str">'@modelcontextprotocol/sdk/server/stdio.js'</span>;

<span class="code-keyword">const</span> server = <span class="code-keyword">new</span> Server({ name: <span class="code-str">'devbits-mcp-tool'</span>, version: <span class="code-str">'1.0.0'</span> });
server.<span class="code-func">setRequestHandler</span>(ListToolsRequestSchema, <span class="code-keyword">async</span> () => ({
  tools: [{ name: <span class="code-str">'query_codebase'</span>, description: <span class="code-str">'Semantic vector search'</span> }]
}));`,
  tab3: `<span class="code-comment">// 🛡️ Token-Bucket Rate Limiting Middleware</span>
<span class="code-keyword">import</span> { Redis } <span class="code-keyword">from</span> <span class="code-str">'@upstash/redis'</span>;
<span class="code-keyword">import</span> { Ratelimit } <span class="code-keyword">from</span> <span class="code-str">'@upstash/ratelimit'</span>;

<span class="code-keyword">const</span> ratelimit = <span class="code-keyword">new</span> Ratelimit({
  redis: Redis.<span class="code-func">fromEnv</span>(),
  limiter: Ratelimit.<span class="code-func">slidingWindow</span>(10, <span class="code-str">'10 s'</span>),
  analytics: <span class="code-keyword">true</span>,
});`,
  tab4: `<span class="code-comment">// 📊 Real-Time Telemetry & Agent Step Logging</span>
<span class="code-keyword">export function</span> <span class="code-func">logAgentStep</span>(stepId: <span class="code-str">string</span>, status: <span class="code-str">'SUCCESS'</span> | <span class="code-str">'RETRY'</span>) {
  console.<span class="code-func">info</span>(\`[Agent Telemetry] Step \${stepId} -> \${status}\`);
  metrics.<span class="code-func">increment</span>(<span class="code-str">'agent_steps_executed'</span>, { status });
}`
};

// Code tab switcher
function switchTab(element, tabKey) {
  document.querySelectorAll('.preview-item').forEach(el => el.classList.remove('active'));
  element.classList.add('active');
  const codeDisplay = document.getElementById('code-snippet-display');
  if (codeDisplay && codeSnippets[tabKey]) {
    codeDisplay.innerHTML = codeSnippets[tabKey];
  }
}

// Countdown timer
function startCountdown(durationMinutes) {
  let timer = durationMinutes * 60;
  const timerDisplay = document.getElementById('countdown-timer');

  const interval = setInterval(() => {
    const minutes = Math.floor(timer / 60);
    const seconds = timer % 60;
    const formattedMinutes = minutes < 10 ? '0' + minutes : minutes;
    const formattedSeconds = seconds < 10 ? '0' + seconds : seconds;

    if (timerDisplay) {
      timerDisplay.textContent = `${formattedMinutes}:${formattedSeconds}`;
    }

    if (--timer < 0) {
      timer = durationMinutes * 60; // Loop or lock timer
    }
  }, 1000);
}

// Smooth scroll to pricing
function scrollToPricing() {
  const target = document.getElementById('pricing-section');
  if (target) {
    target.scrollIntoView({ behavior: 'smooth' });
  }
}

// Checkout Modal Handlers
function openCheckout(packageName, price) {
  state.selectedPackage = packageName;
  state.basePrice = price;
  
  const titleEl = document.getElementById('selected-package-title');
  const summaryNameEl = document.getElementById('summary-tier-name');
  const summaryPriceEl = document.getElementById('summary-tier-price');
  
  if (titleEl) titleEl.textContent = packageName;
  if (summaryNameEl) summaryNameEl.textContent = packageName;
  if (summaryPriceEl) summaryPriceEl.textContent = `$${price.toFixed(2)}`;

  // Reset bump check
  const bumpCheck = document.getElementById('bump-checkbox-input');
  if (bumpCheck) {
    bumpCheck.checked = false;
    state.hasOrderBump = false;
  }
  
  updateTotals();
  goToStep(1);

  const modal = document.getElementById('checkout-modal');
  if (modal) modal.classList.add('active');
}

function closeCheckout() {
  const modal = document.getElementById('checkout-modal');
  if (modal) modal.classList.remove('active');
}

function toggleOrderBump(checkbox) {
  state.hasOrderBump = checkbox.checked;
  const bumpRow = document.getElementById('bump-summary-row');
  if (bumpRow) {
    bumpRow.style.display = state.hasOrderBump ? 'flex' : 'none';
  }
  updateTotals();
}

function updateTotals() {
  const total = state.basePrice + (state.hasOrderBump ? state.bumpPrice : 0);
  const totalEl = document.getElementById('summary-total-price');
  const payBtnText = document.getElementById('pay-btn-text');
  
  if (totalEl) totalEl.textContent = `$${total.toFixed(2)}`;
  if (payBtnText) payBtnText.textContent = `Complete Secure Order ($${total.toFixed(2)})`;
}

function goToStep(stepNumber) {
  state.currentStep = stepNumber;
  const step1Content = document.getElementById('checkout-step-1');
  const step2Content = document.getElementById('checkout-step-2');
  const step1Ind = document.getElementById('step-1-indicator');
  const step2Ind = document.getElementById('step-2-indicator');

  if (stepNumber === 1) {
    if (step1Content) step1Content.style.display = 'block';
    if (step2Content) step2Content.style.display = 'none';
    if (step1Ind) {
      step1Ind.className = 'step-item active';
    }
    if (step2Ind) {
      step2Ind.className = 'step-item';
    }
  } else {
    if (step1Content) step1Content.style.display = 'none';
    if (step2Content) step2Content.style.display = 'block';
    if (step1Ind) {
      step1Ind.className = 'step-item completed';
    }
    if (step2Ind) {
      step2Ind.className = 'step-item active';
    }
  }
}

// Checkout Form Submission (Simulated Payment Processing)
function handleCheckoutSubmit(event) {
  event.preventDefault();
  
  const nameInput = document.getElementById('cust-name');
  const emailInput = document.getElementById('cust-email');
  
  state.customerName = nameInput ? nameInput.value : 'Developer';
  state.customerEmail = emailInput ? emailInput.value : 'user@devbits.io';

  const btnText = document.getElementById('pay-btn-text');
  const btnSpinner = document.getElementById('pay-btn-spinner');
  const submitBtn = document.getElementById('pay-submit-btn');

  if (btnText && btnSpinner && submitBtn) {
    btnText.style.display = 'none';
    btnSpinner.style.display = 'inline-block';
    submitBtn.disabled = true;
  }

  // Simulate 1.5 second API server request latency
  setTimeout(() => {
    if (btnText && btnSpinner && submitBtn) {
      btnText.style.display = 'inline-block';
      btnSpinner.style.display = 'none';
      submitBtn.disabled = false;
    }

    // Close checkout modal & open Thank You / OTO modal
    closeCheckout();
    
    const confirmNameEl = document.getElementById('customer-confirm-name');
    const confirmEmailEl = document.getElementById('customer-confirm-email');
    if (confirmNameEl) confirmNameEl.textContent = state.customerName;
    if (confirmEmailEl) confirmEmailEl.textContent = state.customerEmail;

    const thankyouModal = document.getElementById('thankyou-modal');
    if (thankyouModal) thankyouModal.classList.add('active');
  }, 1500);
}

function acceptUpsell() {
  alert(`⚡ Awesome! We added the 1-on-1 Architecture Review ($97) to your order. Confirmation sent to ${state.customerEmail}.`);
  finishFunnel();
}

function finishFunnel() {
  const thankyouModal = document.getElementById('thankyou-modal');
  if (thankyouModal) thankyouModal.classList.remove('active');
  alert(`🚀 Access link dispatched! Check your inbox (${state.customerEmail}). Happy building!`);
}

// Social Proof Toast Notification System
const recentPurchases = [
  { name: 'Alex M. from San Francisco, CA', action: 'Just bought Pro Architecture Bundle', avatar: 'AM', time: '1m ago' },
  { name: 'Elena R. from London, UK', action: 'Unlocked Pro Bundle + VIP Prompt Sheet', avatar: 'ER', time: '3m ago' },
  { name: 'David K. from Berlin, Germany', action: 'Purchased Team License (10 Devs)', avatar: 'DK', time: '5m ago' },
  { name: 'Siddharth P. from Toronto, Canada', action: 'Just bought Pro Architecture Bundle', avatar: 'SP', time: '7m ago' }
];

let purchaseIndex = 0;

function showNextToast() {
  const toast = document.getElementById('buyer-toast');
  const avatarEl = document.getElementById('toast-avatar');
  const nameEl = document.getElementById('toast-name');
  const actionEl = document.getElementById('toast-action');

  if (!toast || !avatarEl || !nameEl || !actionEl) return;

  const item = recentPurchases[purchaseIndex];
  avatarEl.textContent = item.avatar;
  nameEl.textContent = item.name;
  actionEl.textContent = item.action;

  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 4500);

  purchaseIndex = (purchaseIndex + 1) % recentPurchases.length;
}

// Interactive Agent Terminal Simulator
let isSimulating = false;
function runAgentSimulation() {
  const terminal = document.getElementById('terminal-output');
  if (!terminal || isSimulating) return;

  isSimulating = true;
  terminal.innerHTML = `<p class="term-line"><span class="term-prompt">$</span> devbits run-pipeline --goal="Build & Deploy AI App"</p>`;

  const steps = [
    { text: '[1/4] ⚡ Initializing Agentic AI Engine (Gemini 3.6 Flash)...', class: 'term-dim', delay: 400 },
    { text: '[2/4] 🛠️ Invoking MCP Protocol: AST Parser & Tool Registry...', class: 'term-gold', delay: 1000 },
    { text: '[3/4] 🛡️ Security Check: Input Sanitized & Rate Limits Verified.', class: 'term-dim', delay: 1600 },
    { text: '[4/4] ✅ Solution Generated: 100% Production Ready Bundle Compiled in dist/!', class: 'term-success', delay: 2200 }
  ];

  steps.forEach(step => {
    setTimeout(() => {
      const line = document.createElement('p');
      line.className = `term-line ${step.class}`;
      line.textContent = step.text;
      terminal.appendChild(line);
    }, step.delay);
  });

  setTimeout(() => {
    isSimulating = false;
  }, 2600);
}

// Theme Switcher Management
function initTheme() {
  const savedTheme = localStorage.getItem('devbits-theme') || 'obsidian';
  setTheme(savedTheme);
}

function setTheme(themeName) {
  document.body.setAttribute('data-theme', themeName);
  const themeSelect = document.getElementById('theme-select');
  if (themeSelect) {
    themeSelect.value = themeName;
  }
  localStorage.setItem('devbits-theme', themeName);
}

function changeTheme(themeName) {
  setTheme(themeName);
}

// Initialize Funnel on Page Load
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  startCountdown(15);
  
  // Trigger first toast after 4s, then every 12s
  setTimeout(showNextToast, 4000);
  setInterval(showNextToast, 14000);
});
