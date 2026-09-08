import { Button } from "@/components/ui/button.jsx";
import { Checkbox } from "@/components/ui/checkbox.jsx";
import { Input } from "@/components/ui/input.jsx";
import { Textarea } from "@/components/ui/textarea.jsx";

export function LegacyButton({ className = "", type, ...props }) {
  const variant = /danger|destructive/.test(className)
    ? "destructive"
    : /primary|whatsapp/.test(className)
      ? "default"
      : /quiet|icon-button|tab/.test(className)
        ? "ghost"
        : "outline";
  return <Button type={type} variant={variant} className={className} {...props} />;
}

export function LegacyInput({ type, checked, onChange, value, name, ...props }) {
  if (type === "checkbox") {
    return (
      <Checkbox
        checked={checked}
        onCheckedChange={(next) => onChange?.({ target: { checked: next === true, value, name } })}
        {...props}
      />
    );
  }
  return <Input type={type} checked={type === "radio" ? checked : undefined} value={value} name={name} onChange={onChange} {...props} />;
}

export function LegacyTextarea(props) {
  return <Textarea {...props} />;
}
