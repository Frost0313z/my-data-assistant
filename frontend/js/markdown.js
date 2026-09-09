// A4: AI 답변의 마크다운을 서식으로 그린다.
//
// **innerHTML을 한 번도 쓰지 않는다.** 문자열을 조립해서 넣고 이스케이프로 막는 방식은
// 한 군데만 빠뜨려도 뚫린다. 여기서는 만들 수 있는 노드가 아래 화이트리스트뿐이라,
// 어떤 입력이 들어와도 스크립트가 실행될 경로 자체가 없다.
//
// 지원: ## ### 제목 · **굵게** · `코드` · - 목록 · 1. 목록 · | 표 | · 문단
// 나머지는 전부 그냥 글자다. 링크(`[]()`)는 일부러 뺐다 — AI가 만든 URL로 사용자를
// 보내는 건 이 서비스가 보증할 수 없는 일이다.
(function (global) {
  const BOLD = /\*\*([^*]+)\*\*/;
  const CODE = /`([^`]+)`/;

  // 한 줄 안의 인라인 서식. 정규식으로 자르고 **텍스트 노드로만** 다시 붙인다.
  function inline(target, text) {
    while (text) {
      const bold = BOLD.exec(text);
      const code = CODE.exec(text);
      // 더 앞에 나오는 것을 먼저 처리한다
      const hit = !bold ? code : !code ? bold : bold.index <= code.index ? bold : code;
      if (!hit) break;
      if (hit.index > 0) target.appendChild(document.createTextNode(text.slice(0, hit.index)));
      const el = document.createElement(hit === bold ? "strong" : "code");
      el.textContent = hit[1];
      target.appendChild(el);
      text = text.slice(hit.index + hit[0].length);
    }
    if (text) target.appendChild(document.createTextNode(text));
  }

  function isTableRow(line) {
    return line.startsWith("|") && line.endsWith("|");
  }
  function cells(line) {
    return line.slice(1, -1).split("|").map((c) => c.trim());
  }
  // |---|---| 구분선. 표의 머리와 몸을 가른다.
  function isDivider(line) {
    return isTableRow(line) && cells(line).every((c) => /^:?-{2,}:?$/.test(c));
  }

  function render(markdown) {
    const root = document.createDocumentFragment();
    const lines = String(markdown ?? "").split("\n");
    let i = 0;

    const flushParagraph = (buffer) => {
      if (!buffer.length) return;
      const p = document.createElement("p");
      buffer.forEach((line, index) => {
        if (index) p.appendChild(document.createElement("br"));
        inline(p, line);
      });
      root.appendChild(p);
    };

    let paragraph = [];
    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) {
        flushParagraph(paragraph);
        paragraph = [];
        i += 1;
        continue;
      }

      const heading = /^(#{2,4})\s+(.*)$/.exec(trimmed);
      if (heading) {
        flushParagraph(paragraph);
        paragraph = [];
        // h1은 화면에 이미 하나뿐이어야 한다(서비스 제목). 답변은 h3부터 시작한다.
        const level = Math.min(6, heading[1].length + 1);
        const el = document.createElement(`h${level}`);
        inline(el, heading[2]);
        root.appendChild(el);
        i += 1;
        continue;
      }

      if (isTableRow(trimmed)) {
        flushParagraph(paragraph);
        paragraph = [];
        const rows = [];
        while (i < lines.length && isTableRow(lines[i].trim())) {
          rows.push(lines[i].trim());
          i += 1;
        }
        root.appendChild(buildTable(rows));
        continue;
      }

      const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
      const numbered = /^\d+\.\s+(.*)$/.exec(trimmed);
      if (bullet || numbered) {
        flushParagraph(paragraph);
        paragraph = [];
        const ordered = !!numbered;
        const list = document.createElement(ordered ? "ol" : "ul");
        while (i < lines.length) {
          const t = lines[i].trim();
          const m = ordered ? /^\d+\.\s+(.*)$/.exec(t) : /^[-*]\s+(.*)$/.exec(t);
          if (!m) break;
          const li = document.createElement("li");
          inline(li, m[1]);
          list.appendChild(li);
          i += 1;
        }
        root.appendChild(list);
        continue;
      }

      paragraph.push(trimmed);
      i += 1;
    }
    flushParagraph(paragraph);
    return root;
  }

  function buildTable(rows) {
    const table = document.createElement("table");
    table.className = "md-table";
    const body = document.createElement("tbody");
    let head = null;
    rows.forEach((row, index) => {
      if (isDivider(row)) return;
      const isHead = index === 0 && rows.length > 1 && isDivider(rows[1]);
      const tr = document.createElement("tr");
      cells(row).forEach((text) => {
        const cell = document.createElement(isHead ? "th" : "td");
        inline(cell, text);
        tr.appendChild(cell);
      });
      if (isHead) {
        head = document.createElement("thead");
        head.appendChild(tr);
      } else {
        body.appendChild(tr);
      }
    });
    if (head) table.appendChild(head);
    table.appendChild(body);
    return table;
  }

  // 이 함수 하나만 밖으로 낸다. 호출부는 항상 요소를 비우고 조각을 넣는다.
  global.renderMarkdown = function (element, markdown) {
    element.textContent = "";
    element.appendChild(render(markdown));
    return element;
  };
})(window);
