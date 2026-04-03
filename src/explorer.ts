import { Page } from "playwright";
import { DomSnapshot, ElementInfo, FormInfo, LinkInfo, NetworkCall } from "./types.js";

const networkLog: NetworkCall[] = [];

export function attachNetworkLogger(page: Page) {
  networkLog.length = 0;
  page.on("request", (req) => {
    networkLog.push({
      method: req.method(),
      url: req.url(),
      type: req.resourceType(),
    });
  });
  page.on("response", (res) => {
    const entry = networkLog.find(
      (n) => n.url === res.url() && !n.status
    );
    if (entry) entry.status = res.status();
  });
}

export function getNetworkLog(): NetworkCall[] {
  return [...networkLog];
}

export async function snapshot(page: Page): Promise<DomSnapshot> {
  return page.evaluate(() => {
    function getSelector(el: Element): string {
      if (el.id) return `#${el.id}`;
      if (el.getAttribute("data-testid")) return `[data-testid="${el.getAttribute("data-testid")}"]`;
      if (el.getAttribute("name")) return `${el.tagName.toLowerCase()}[name="${el.getAttribute("name")}"]`;

      const tag = el.tagName.toLowerCase();
      const parent = el.parentElement;
      if (!parent) return tag;
      const siblings = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
      if (siblings.length === 1) return `${getSelector(parent)} > ${tag}`;
      const idx = siblings.indexOf(el) + 1;
      return `${getSelector(parent)} > ${tag}:nth-child(${idx})`;
    }

    function isVisible(el: Element): boolean {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false;
      const style = getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
    }

    function getLabel(el: Element): string | undefined {
      const id = el.getAttribute("id");
      if (id) {
        const label = document.querySelector(`label[for="${id}"]`);
        if (label) return label.textContent?.trim();
      }
      const parent = el.closest("label");
      if (parent) return parent.textContent?.trim();
      const aria = el.getAttribute("aria-label");
      if (aria) return aria;
      return undefined;
    }

    function elementInfo(el: Element): ElementInfo {
      return {
        tag: el.tagName.toLowerCase(),
        selector: getSelector(el),
        type: el.getAttribute("type") || undefined,
        text: el.textContent?.trim().slice(0, 100) || undefined,
        placeholder: el.getAttribute("placeholder") || undefined,
        label: getLabel(el),
        role: el.getAttribute("role") || undefined,
        visible: isVisible(el),
      };
    }

    // Gather interactive elements
    const interactiveSelectors = "a, button, input, select, textarea, [role='button'], [role='link'], [role='tab'], [onclick]";
    const elements: ElementInfo[] = Array.from(document.querySelectorAll(interactiveSelectors))
      .filter(isVisible)
      .slice(0, 200)
      .map(elementInfo);

    // Gather forms
    const forms: FormInfo[] = Array.from(document.querySelectorAll("form")).map((form) => {
      const fields = Array.from(form.querySelectorAll("input, select, textarea"))
        .filter(isVisible)
        .map(elementInfo);
      const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
      return {
        selector: getSelector(form),
        fields,
        submitButton: submitBtn ? elementInfo(submitBtn) : undefined,
      };
    });

    // Gather links
    const links: LinkInfo[] = Array.from(document.querySelectorAll("a[href]"))
      .filter(isVisible)
      .slice(0, 100)
      .map((a) => ({
        text: a.textContent?.trim().slice(0, 100) || "",
        href: a.getAttribute("href") || "",
        selector: getSelector(a),
      }));

    // Page text summary
    const text = document.body?.innerText?.slice(0, 3000) || "";

    return {
      url: location.href,
      title: document.title,
      elements,
      forms,
      links,
      text,
    };
  });
}
