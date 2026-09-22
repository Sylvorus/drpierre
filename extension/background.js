chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractQuestionText') {
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      world: 'MAIN',
      func: () => {
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

          return text;
        } catch (e) {
          return "Extraction Error: " + e.toString();
        }
      }
    }).then(results => {
      sendResponse({ text: results[0].result });
    }).catch(err => {
      sendResponse({ error: err.toString() });
    });
    return true; 
  }

  if (request.action === 'solve') {
    chrome.storage.sync.get({ userApiKey: '', selectedModel: 'gemini-3.5-flash' }, async (data) => {
      if (!data.userApiKey) {
        sendResponse({ error: 'Missing API Key. Set it in the extension popup.' });
        return;
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

Question text: ${request.prompt}` 
              }]
            }]
          })
        });

        const resData = await response.json();
        if (!response.ok) {
          throw new Error(resData.error?.message || `HTTP ${response.status}`);
        }
        
        const answer = resData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
        sendResponse({ answer });
      } catch (err) {
        sendResponse({ error: err.toString() });
      }
    });
    return true; 
  }
});
