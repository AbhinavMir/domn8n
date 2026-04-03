export interface Action {
  type: "click" | "fill" | "select" | "navigate" | "wait" | "ask_user" | "goal_reached";
  selector?: string;
  value?: string;
  label?: string;
  url?: string;
  sensitive?: boolean;
  description: string;
}

export interface RecordedStep {
  action: Action;
  url: string;
  timestamp: number;
  userValue?: string;
}

export interface DomSnapshot {
  url: string;
  title: string;
  elements: ElementInfo[];
  forms: FormInfo[];
  links: LinkInfo[];
  text: string;
}

export interface ElementInfo {
  tag: string;
  selector: string;
  type?: string;
  text?: string;
  placeholder?: string;
  label?: string;
  role?: string;
  visible: boolean;
}

export interface FormInfo {
  selector: string;
  fields: ElementInfo[];
  submitButton?: ElementInfo;
}

export interface LinkInfo {
  text: string;
  href: string;
  selector: string;
}

export interface NetworkCall {
  method: string;
  url: string;
  status?: number;
  type: string;
}
