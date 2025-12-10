# **Digital Product Shopping Agent for Vietnamese**

Dưới đây là các chiến lược có thể dùng để customize lại nanobrowser.

1. **Clarification phase before planning**  
     
   * Introduce a **Requirement Interpreter** step that focuses on **Raw Context Accumulation**.
   * **Goal:** Instead of trying to parse every nuance into a rigid database schema (which is error-prone for Vietnamese), we strictly extract only the **Hard Constraints** (Product Type, Budget, Brand). Everything else is captured as **Raw User Context**.
       
   * **Workflow**:
     1. **Infer Category & Hard Data:** Detect 'Laptop'/'Phone', convert "20 triệu" -> 20,000,000, extract Brands.
     2. **Clarify Missing Context:** If the user hasn't mentioned their usage (gaming, office) or preferences (battery, camera), ask simple Vietnamese questions to get more text.
     3. **Accumulate:** Store user answers verbatim in a `requirements_context` log.

   * **Result**: A `TargetProductProfile` containing:
     - `product_type`: 'laptop'
     - `budget_vnd`: 20000000
     - `pref_brands`: ['dell']
     - `requirements_context`: ["Tìm máy dell 20tr", "Dùng cho kế toán", "Thích màn hình to"]

---

2. **Prompt / context engineering for the Planner**  
     
   * The **Planner Agent** becomes the intelligent interpreter.
   * **Input**: It receives the structured Hard Constraints AND the full `requirements_context`.
   * **Role**: The Planner reads the raw context (e.g., "Thích màn hình to") and translates it into actions (e.g., "Filter Screen Size > 15.6 inch" or "Search for 'Laptop 16 inch'").
   * **Advantage**: This leverages the LLM's superior language understanding capabilities to handle nuances like "pin trâu" (big battery) or "chụp đêm đẹp" (good night photography) which are hard to code manually.

---

3. **DOM \+ multi-modal interaction strategies & Safeguards**  
     
   * **Real-time Truth Rule (Critical):** The agent must prioritize website data over internal training knowledge. It must verify existence/price on-site before answering.
   * **Anti-loop & Hard Stops:** 
     * Stop if login/2FA/payment is requested.
     * Stop if captcha appears (unless screenshot provided).
     * Prevent repetitive actions (same action twice = loop).
   * **DOM-First / Vision-Second:** 
     * Navigator system message: “Inspect DOM text first; when ambiguous, use the screenshot to interpret icons, badges, filters, and category-specific UI elements (e.g., camera badges on phones, ANC tags on headphones).”  
       
   * **Robust DOM heuristics** (category‑aware):  
       
     * Prefer semantic cues: “Giá”, “RAM”, “SSD”, “Hãng”, “Bộ nhớ”, “Camera”, “Pin”, “Chống ồn”, etc.  
     * Ignore noise: banners, ads, pop-ups, “sản phẩm tương tự”. Include real DOM snippet examples.

---

4. **Flexible planning (“good enough page”)**  
     
   * Planner describes **intent**, not exact selectors: “Describe the type of page and filters. Navigator may adapt to equivalent or approximate pages.”  
       
   * Navigator uses **fuzzy-match rules**:  
       
     * Treat any listing page with visible price/specs as valid, even if labels differ.  
     * Missing filters → collect broader items and filter in-model (parse product titles/spec blocks).

---

5. **Comparison-oriented context**  
     
   * Maintain a **generalized product schema** for the final output/comparison (standardizing extracted data *after* visiting product pages), but do not force this schema on the *input* requirements.
       
     * Common: `price_vnd`, `brand`, `model`, `weight`, `battery`, `screen_spec`, `connectivity`, `warranty`  
     * Laptop fields: `ram_gb`, `ssd_gb`, `cpu_model`, `gpu_model`  
     * Phone fields: `camera_main_mp`, `camera_ultrawide_mp`, `battery_mah`, `chipset`  
     * Headphone fields: `anc`, `wireless`, `latency_ms`, `driver_size_mm`

---

6. **Where fine-tuning helps most (optional)**  
     
   * **Extraction fine-tune**: on Shopee/CellphoneS/FPTShop pages for laptops, phones, headphones → map messy spec tables into unified schema.  
   * **Navigation fine-tune**: log DOM → action trajectories per category → fine-tune a navigation model specialized for VN e-commerce patterns.
