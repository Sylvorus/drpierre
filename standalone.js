javascript:(function() {
  if (document.getElementById('dr-pierre-ui')) {
    document.getElementById('dr-pierre-ui').remove();
  }

  const Storage = {
    get: (keys) => {
      const data = {};
      for (const key in keys) {
        data[key] = localStorage.getItem(`drpierre_${key}`) || keys[key];
      }
      return data;
    },
    set: (data) => {
      for (const key in data) {
        localStorage.setItem(`drpierre_${key}`, data[key]);
      }
    }
  };

  const ui = document.createElement('div');
  ui.id = 'dr-pierre-ui';
  ui.style.cssText = `
    position: fixed; bottom: 20px; right: 20px; z-index: 999999;
    background: white; border: 1px solid #ccc; padding: 12px;
    border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    font-family: sans-serif; font-size: 14px; width: 280px; color: #000;
  `;

  ui.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 8px; display: flex; justify-content: space-between;">
      <span>Dr Pierre</span>
      <span id="df-settings-toggle" style="cursor: pointer; font-size: 12px; color: #007bff; text-decoration: underline;">Settings</span>
    </div>
    
    <div id="df-settings-panel" style="display: none; margin-bottom: 8px; font-size: 12px; background: #f9f9f9; padding: 8px; border-radius: 4px; border: 1px solid #ddd;">
      <label style="display: block; font-weight: bold; margin-bottom: 4px;">Gemini API Key:</label>
      <input type="password" id="df-api-key" placeholder="Paste key here..." style="width: 100%; margin-bottom: 8px; padding: 4px; box-sizing: border-box;">
      
      <label style="display: block; font-weight: bold; margin-bottom: 4px;">Gemini Model:</label>
      <select id="df-model-select" style="width: 100%; padding: 4px; margin-bottom: 8px; box-sizing: border-box;">
        <option value="gemini-3.5-flash-lite">3.5 Flash Lite</option>
        <option value="gemini-3.5-flash">3.5 Flash</option>
        <option value="gemini-3.6-flash">3.6 Flash</option>
        <option value="gemini-3.7-flash">3.7 Flash</option>
        <option value="gemini-3.8-flash">3.8 Flash</option>
      </select>
      
      <button id="df-save-settings" style="width: 100%; padding: 4px; cursor: pointer;">Save Settings</button>
      <div id="df-settings-status" style="color: #28a745; margin-top: 4px; height: 14px; font-weight: bold;"></div>
    </div>

    <button id="df-solve-btn" style="width: 100%; padding: 8px; margin-bottom: 8px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Solve Question</button>
    <div id="df-status" style="margin-bottom: 8px; font-size: 14px; color: #333; white-space: pre-wrap; min-height: 24px; transition: color 0.2s;">Ready</div>
    <button id="df-enter-submit-btn" style="width: 100%; padding: 8px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; display: none; font-weight: bold;">Enter and Submit</button>
  `;

  document.body.appendChild(ui);

  const settings = Storage.get({ userApiKey: '', selectedModel: 'gemini-3.5-flash' });
  document.getElementById('df-api-key').value = settings.userApiKey;
  document.getElementById('df-model-select').value = settings.selectedModel;

  document.getElementById('df-settings-toggle').addEventListener('click', () => {
    const panel = document.getElementById('df-settings-panel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });

  document.getElementById('df-save-settings').addEventListener('click', () => {
    Storage.set({
      userApiKey: document.getElementById('df-api-key').value.trim(),
      selectedModel: document.getElementById('df-model-select').value
    });
    const st = document.getElementById('df-settings-status');
    st.innerText = 'Settings saved securely!';
    setTimeout(() => { st.innerText = ''; }, 2000);
  });

  let currentAnswerLaTeX = "";
  let isObservingIncorrect = false;

  function renderMathInUI(latexString, prefix = "Answer: ") {
    let statusEl = document.getElementById('df-status');
    
    let displayText = latexString;
    const mcqMatch = latexString.match(/Option\s+(\d+)/i);
    if (mcqMatch) {
      const idx = parseInt(mcqMatch[1], 10) - 1;
      const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
      if (radios[idx]) {
        const labelText = (radios[idx].closest('label') || radios[idx].parentElement).textContent.replace(/\s+/g, ' ').trim();
        displayText = `Option ${idx + 1}: ${labelText}`;
      }
    }
    
    statusEl.style.cursor = 'pointer';
    statusEl.title = 'Click to copy answer';
    statusEl.innerText = prefix + displayText;
    
    const clone = statusEl.cloneNode(true);
    statusEl.parentNode.replaceChild(clone, statusEl);
    
    clone.addEventListener('click', () => {
      if (!latexString) return;
      navigator.clipboard.writeText(displayText).then(() => {
        clone.innerText = "Copied to clipboard!";
        clone.style.color = "#28a745";
        setTimeout(() => {
          clone.innerText = prefix + displayText;
          clone.style.color = "#333";
        }, 1500);
      }).catch(err => console.error("Clipboard copy failed:", err));
    });
  }

  function extractQuestionText() {
    try {
      let mj3Items = [];
      if (window.MathJax && window.MathJax.startup) {
        mj3Items = window.MathJax.startup.document.getMathItemsWithin(document.body);
        mj3Items.forEach(item => {
          const node = item.typesetRoot || item.node;
          if (node && node.setAttribute) {
            node.setAttribute('data-df-math', item.math);
          }
        });
      }

      const tempDiv = document.createElement('div');
      tempDiv.style.cssText = 'position: absolute; left: -9999px; top: 0; opacity: 0; pointer-events: none; width: 1000px;';
      tempDiv.innerHTML = document.body.innerHTML;
      document.body.appendChild(tempDiv);

      tempDiv.querySelectorAll('mjx-container[data-df-math]').forEach(el => {
        el.replaceWith(document.createTextNode(` ${el.getAttribute('data-df-math')} `));
      });

      tempDiv.querySelectorAll('.MathJax, .MathJax_Display, .katex, .mq-math-mode').forEach(mathWrapper => {
        const texNode = mathWrapper.querySelector('annotation[encoding="application/x-tex"], script[type^="math/tex"], .katex-mathml annotation');
        if (texNode) {
          const latex = texNode.textContent.replace(/\\displaystyle/g, '').trim();
          mathWrapper.replaceWith(document.createTextNode(` ${latex} `));
        }
      });

      let text = tempDiv.innerText.slice(0, 3500);
      document.body.removeChild(tempDiv);

      mj3Items.forEach(item => {
        const node = item.typesetRoot || item.node;
        if (node && node.removeAttribute) {
          node.removeAttribute('data-df-math');
        }
      });

      const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
      if (radios.length > 0) {
        text += "\n\n--- MULTIPLE CHOICE OPTIONS ---\n";
        radios.forEach((r, idx) => {
          const labelText = (r.closest('label') || r.parentElement).textContent.replace(/\s+/g, ' ').trim();
          text += `Option ${idx + 1}: ${labelText}\n`;
        });
      }

      return { text };
    } catch (e) {
      return { error: "Extraction Error: " + e.toString() };
    }
  }

  async function fetchSolve(prompt) {
    const data = Storage.get({ userApiKey: '', selectedModel: 'gemini-3.5-flash' });
    if (!data.userApiKey) {
      return { error: 'Missing API Key. Open settings in the UI to set it.' };
    }

    try {
      const modelToUse = data.selectedModel || 'gemini-3.5-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${data.userApiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ 
              text: `You are an expert UK A-Level Maths and Physics solver.
Solve the following question. You MUST follow this process to ensure 100% accuracy:
1. Write out your full step-by-step working to prevent algebra and expansion errors.
2. RIGOROUS ALGEBRA: When finding inverse functions involving roots, explicitly write out the squaring of both sides. Do NOT drop exponents (e.g., x^2 or y^2) when isolating variables.
3. VERIFICATION: Explicitly double-check that no exponents, powers, or negative signs were dropped during variable swaps, expansions, or fractions.
4. FORMATTING: Strictly obey any formatting rules in the question (e.g., "give your answer in the form (Ax+B)/(C+Dx)"). Pay exact attention to the order of terms.
5. FINAL ANSWER: Once verified, output ONLY your final answer enclosed exactly in <answer> tags at the very end. 
6. MATH EQUATIONS: If it is a mathematical answer, put pure LaTeX inside the tags (e.g., <answer>\\frac{5 - 10x^2}{3x^2 - 7}</answer>). Do not include "x =" or $ delimiters.
7. TEXT/EXPLAIN QUESTIONS: If the question asks for an explanation (e.g., "Explain why..."), output normal plain text inside the tags. Do NOT wrap it in \\text{}. And keep an eye out for the mark amount, where 1 mark would require a short answer and 3-4 would require a longer (but not essay) long answer.
8. If "--- MULTIPLE CHOICE OPTIONS ---" is present, put ONLY the correct option number inside the tags (e.g., <answer>Option 2</answer>).

Question text: ${prompt}` 
            }]
          }]
        })
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error?.message || `HTTP ${response.status}`);
      }
      
      const answer = resData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
      return { answer };
    } catch (err) {
      return { error: err.toString() };
    }
  }

  async function solveQuestion(isReattempt = false) {
    const statusEl = document.getElementById('df-status');
    statusEl.innerText = isReattempt ? 'Incorrect! Re-calculating...' : 'Reading question & thinking...';
    statusEl.style.cursor = 'default';

    const extResponse = extractQuestionText();
    if (extResponse.error) {
      statusEl.innerText = extResponse.error;
      return;
    }

    let questionText = extResponse.text || "";

    if (isReattempt && currentAnswerLaTeX) {
      questionText += `\n\n[System Note: A previous attempt of "${currentAnswerLaTeX}" was INCORRECT. Re-evaluate and provide a corrected answer.]`;
    }

    const response = await fetchSolve(questionText);
    if (response.error) {
      statusEl.innerText = response.error;
      return;
    }

    const fullOutput = response.answer || '';
    const match = fullOutput.match(/<answer>([\s\S]*?)(?:<\/answer>|\\endanswer>|\\end{answer})/i);
    currentAnswerLaTeX = match ? match[1].trim() : fullOutput.trim();

    renderMathInUI(currentAnswerLaTeX, isReattempt ? "Re-solved: " : "Answer: ");
    document.getElementById('df-enter-submit-btn').style.display = 'block';
  }

  document.getElementById('df-solve-btn').addEventListener('click', () => {
    stopIncorrectMonitoring();
    solveQuestion(false);
  });

  document.getElementById('df-enter-submit-btn').addEventListener('click', () => {
    document.getElementById('df-settings-panel').style.display = 'none'; // Closes the settings panel before injecting

    const statusEl = document.getElementById('df-status');
    statusEl.innerText = `Injecting...`;
    statusEl.style.cursor = 'default';

    const injected = injectIntoDrFrost(currentAnswerLaTeX);

    if (injected) {
      setTimeout(() => {
        if (clickSubmitButton()) {
          renderMathInUI(currentAnswerLaTeX, "Submitted: ");
          document.getElementById('df-enter-submit-btn').style.display = 'none';
          startIncorrectMonitoring();
        } else {
           statusEl.innerText = `Answer: ${currentAnswerLaTeX}\n\nInjected, but couldn't find 'Submit' button.`;
        }
      }, 500);
    } else {
      statusEl.innerText = `Failed to find input target.`;
    }
  });

  function startIncorrectMonitoring() {
    stopIncorrectMonitoring();
    isObservingIncorrect = true;

    let checkCount = 0;
    const interval = setInterval(() => {
      checkCount++;
      if (!isObservingIncorrect || checkCount > 30) { 
        clearInterval(interval);
        return;
      }

      const bodyText = document.body.innerText.toLowerCase();
      if (bodyText.includes('incorrect') || bodyText.includes("oops") || bodyText.includes("not right")) {
        clearInterval(interval);
        stopIncorrectMonitoring();
        solveQuestion(true);
      }
    }, 500);
  }

  function stopIncorrectMonitoring() {
    isObservingIncorrect = false;
  }

  function injectIntoDrFrost(answerText) {
    const mcqMatch = answerText.match(/Option\s+(\d+)/i);
    if (mcqMatch) {
      const idx = parseInt(mcqMatch[1], 10) - 1;
      const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
      if (radios[idx]) {
        const clickTarget = radios[idx].closest('label') || radios[idx].parentElement || radios[idx];
        clickTarget.click();
        radios[idx].checked = true;
        radios[idx].dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }

    const mqTextareas = Array.from(document.querySelectorAll('.mq-editable-field textarea, span.mq-textarea textarea'));
    const standardInputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]):not([type="submit"]):not([type="button"]), textarea:not(.mq-textarea), [contenteditable="true"]'))
                                .filter(el => el.getBoundingClientRect().width > 0);
    
    const targets = [...mqTextareas, ...standardInputs];

    if (targets.length > 0) {
      const targetInput = targets[targets.length - 1]; 
      targetInput.focus();
      
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
      
      if (targetInput.tagName === 'INPUT' || targetInput.tagName === 'TEXTAREA') {
        targetInput.value = ''; 
      }

      document.execCommand('insertText', false, answerText);
      
      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
        bubbles: true,
        cancelable: true
      });
      pasteEvent.clipboardData.setData('text/plain', answerText);
      targetInput.dispatchEvent(pasteEvent);
      
      if (targetInput.tagName === 'INPUT' || targetInput.tagName === 'TEXTAREA') {
        let tracker = targetInput._valueTracker;
        targetInput.value = answerText;
        if (tracker) tracker.setValue('');
      } else if (!targetInput.classList.contains('mq-textarea')) {
        targetInput.innerText = answerText;
      }
      
      targetInput.dispatchEvent(new Event('input', { bubbles: true }));
      targetInput.dispatchEvent(new Event('change', { bubbles: true }));
      
      return true;
    }
    return false;
  }

  function clickSubmitButton() {
    const elements = document.querySelectorAll('button, input[type="submit"], input[type="button"], a');
    for (const el of elements) {
      const text = (el.innerText || el.value || '').toLowerCase().trim();
      if (text === 'submit answer' || text === 'submit') {
        el.click();
        return true;
      }
    }
    return false;
  }

  document.addEventListener('click', (e) => {
    const clickTarget = e.target.closest('button, a, div[role="button"]');
    if (clickTarget) {
      const text = (clickTarget.innerText || clickTarget.value || '').toLowerCase().trim();
      if (text.includes('next question') || text === 'next') {
        currentAnswerLaTeX = "";
        stopIncorrectMonitoring();
        
        const statusEl = document.getElementById('df-status');
        if (statusEl) {
          const freshStatusEl = statusEl.cloneNode(false);
          freshStatusEl.innerText = "Ready";
          freshStatusEl.style.color = "#333";
          freshStatusEl.style.cursor = 'default';
          freshStatusEl.title = '';
          statusEl.parentNode.replaceChild(freshStatusEl, statusEl);
        }
        
        const submitBtn = document.getElementById('df-enter-submit-btn');
        if (submitBtn) {
          submitBtn.style.display = 'none';
        }
      }
    }
  });

})();
