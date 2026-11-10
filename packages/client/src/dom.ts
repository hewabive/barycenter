type Child = Node | string | null;

export function el<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  attributes: Record<string, string> = {},
  ...children: Child[]
): HTMLElementTagNameMap[Tag] {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  for (const child of children) {
    if (child !== null) {
      element.append(child);
    }
  }
  return element;
}

export function button(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const element = el("button", { type: "button", title }, label);
  element.addEventListener("click", onClick);
  return element;
}

export function amount(value: number, digits = 1): string {
  return value.toFixed(digits);
}

export function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function required<Type extends Element>(selector: string): Type {
  const element = document.querySelector<Type>(selector);
  if (element === null) {
    throw new Error(`Missing element ${selector}`);
  }
  return element;
}
