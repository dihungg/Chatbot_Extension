# **Digital Product Shopping Agent for Vietnamese**

Dưới đây là các chiến lược có thể dùng để customize lại nanobrowser.

1. **Clarification phase before planning**  
     
   * Introduce a dynamic **Requirement Interpreter** step: before calling `new_task` / Planner, send the user’s raw Vietnamese request to a small LLM prompt whose behavior adapts to the product category (laptop / mobile phone / headphones / other supported digital devices). Its job is to (a) ask at most 3–5 high-level, category‑appropriate questions, then (b) produce a compact profile object.  
       
   * **Prompt pattern for questions (category‑adaptive)**: **System:**

| You are a shopping assistant for consumer electronics and digital devices (e.g., laptops, smartphones, tablets, monitors, headphones, smartwatches, and related accessories). Your task: 1\. Infer the main product category (or categories) from the user’s Vietnamese request. 2\. Ask at most 3 short clarification questions in Vietnamese, tailored to that category.    \- Your questions must always cover:      (a) approximate budget (preferably specify an approximate price range, ideally in VND),      (b) main usage purpose (use case),      (c) any preferred or avoided brands.    \- Optionally, include 1–2 high-level trade-offs that are important for that category      (e.g., performance vs battery life vs portability vs durability vs audio quality vs camera quality),      but still at a high level, without going into detailed specifications. 3\. Do NOT ask for detailed hardware specifications such as exact RAM/SSD capacity,    GPU model, CPU model, or specific benchmarks, unless the user has explicitly provided those details earlier. 4\. If the user mentions multiple product types, choose the most important one to clarify first. Output format: Return only a numbered list (1., 2., 3.) of 1–3 short questions \*\*in Vietnamese\*\*. Do not include any other text or explanation. |
| :---- |

     

   * **Profile representation**: after user answers, normalize into structured JSON (fields vary by product category): `product_type`, `budget_vnd`, `use_case`, and category‑specific flags like `needs_graphics`, `needs_ai`, `needs_gaming`, `needs_large_storage`, `pref_brands`, `avoid_brands`, `camera_priority`, `battery_priority`, `sound_isolation`, etc.  
       
   * **Persist per session**: store that profile in chat/session storage and pass it as `messageContext` / extra system message to later agents.

---

2. **Prompt / context engineering for the Planner**  
     
   * Rewrite the **target product** internally: after clarification, create a canonical description from raw prompt \+ profile, then give only this canonical version to the Planner. Example structured template (Vietnamese, dynamically adapted per category):  
       
     * **Loại sản phẩm** (laptop / điện thoại / tai nghe / ...)  
     * **Mục tiêu người dùng**  
     * **Ngân sách**  
     * **Yêu cầu tối thiểu** (thay đổi theo category: laptop → RAM/SSD/CPU; điện thoại → pin/camera; tai nghe → wireless/ANC)  
     * **Ưu tiên mềm** (thương hiệu, trọng lượng/màn hình/pin cho laptop; camera/pin/kích thước cho điện thoại; chất âm/ANC/độ trễ cho tai nghe)  
     * **Trang web cần duyệt**: [https://shopee.vn/](https://shopee.vn/), [https://cellphones.com.vn/](https://cellphones.com.vn/), [https://fptshop.com.vn/](https://fptshop.com.vn/)

     

   * Make the Planner output explicit **navigation tasks**: a JSON plan listing items of the form `{site, entry_strategy, filter_strategy, stop_conditions}`. Navigator treats this as **hints**, not hard constraints.  
       
   * Encode **Vietnamese e-commerce knowledge** into Planner system prompt: include examples for laptops, phones, and headphones (e.g., “Laptop”, “Điện thoại”, “Tai nghe”, “Giá dưới 15 triệu”, “Dung lượng pin”, “Camera”, “Chống ồn chủ động”).

---

3. **DOM \+ multi-modal interaction strategies**  
     
   * Enable **vision** for the Navigator and (optionally) the Planner. Navigator system message: “Inspect DOM text first; when ambiguous, use the screenshot to interpret icons, badges, filters, and category-specific UI elements (e.g., camera badges on phones, ANC tags on headphones).”  
       
   * **Robust DOM heuristics** (category‑aware):  
       
     * Prefer semantic cues: “Giá”, “RAM”, “SSD”, “Hãng”, “Bộ nhớ”, “Camera”, “Pin”, “Chống ồn”, etc.  
     * Ignore noise: banners, ads, pop-ups, “sản phẩm tương tự”. Include real DOM snippet examples.

     

   * Two-stage filter interaction:  
       
     * Stage 1: identify candidate filter widgets via DOM \+ vision.  
     * Stage 2: verify filter effect by checking changes in listing (prices, specs, camera resolution, battery rating, ANC status, etc.).

---

4. **Flexible planning (“good enough page”)**  
     
   * Planner describes **intent**, not exact selectors: “Describe the type of page and filters. Navigator may adapt to equivalent or approximate pages.”  
       
   * Navigator uses **fuzzy-match rules**:  
       
     * Treat any listing page with visible price/specs as valid, even if labels differ.  
     * Missing filters → collect broader items and filter in-model (parse product titles/spec blocks).

     

   * **Fallback strategies** for Shopee / CellphoneS / FPTShop:  
       
     * If category navigation fails → use site search (“laptop 16GB”, “điện thoại pin trâu”, “tai nghe chống ồn”).  
     * If price sliders are unreliable → scroll and parse prices, then filter in-model.

---

5. **Comparison-oriented context**  
     
   * Maintain a **generalized product schema** (works across laptops, phones, headphones):  
       
     * Common: `price_vnd`, `brand`, `model`, `weight`, `battery`, `screen_spec`, `connectivity`, `warranty`  
     * Laptop fields: `ram_gb`, `ssd_gb`, `cpu_model`, `gpu_model`  
     * Phone fields: `camera_main_mp`, `camera_ultrawide_mp`, `battery_mah`, `chipset`  
     * Headphone fields: `anc`, `wireless`, `latency_ms`, `driver_size_mm`

     

   * Comparison prompt uses this schema to compute:  
       
     * Price/performance ratios (category dependent).  
     * Approx CPU/GPU tiers OR phone SoC tiers OR headphone ANC/audio quality tiers.  
     * Display/networking/sound quality inferred from keywords.

---

6. **Where fine-tuning helps most (optional)**  
     
   * **Requirement Interpreter fine-tune**: train on VN multi-category clarification logs to convert raw requests → stable `TargetProductProfile`.  
       
   * **Extraction fine-tune**: on Shopee/CellphoneS/FPTShop pages for laptops, phones, headphones → map messy spec tables into unified schema.  
       
   * **Navigation fine-tune**: log DOM → action trajectories per category → fine-tune a navigation model specialized for VN e-commerce patterns.