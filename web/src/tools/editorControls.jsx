import { useState } from 'react'
import { styles } from './editorStyles'

export function NumberField({ label, value, min, max, step = 1, onChange }) {
  return (
    <label style={styles.row}>
      <span style={styles.label}>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={styles.numberInput}
      />
    </label>
  )
}

export function SliderField({ label, value, min, max, step = 1, onChange }) {
  const precision = step < 0.01 ? 3 : step < 1 ? 2 : 0
  return (
    <label style={styles.blockField}>
      <span style={styles.sliderLabel}>
        <span>{label}</span>
        <span>{value.toFixed(precision)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={styles.slider}
      />
    </label>
  )
}

export function ColorField({ label, value, onChange }) {
  return (
    <label style={styles.row}>
      <span style={styles.label}>{label}</span>
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={styles.colorInput}
      />
    </label>
  )
}

export function CheckboxField({ label, checked, onChange }) {
  return (
    <label style={styles.row}>
      <span style={styles.label}>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  )
}

export function SelectField({ label, value, options, onChange }) {
  return (
    <label style={styles.blockField}>
      <span style={styles.label}>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} style={styles.select}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  )
}

export function Section({ title, children }) {
  const [open, setOpen] = useState(true)

  return (
    <section style={styles.section}>
      <button type="button" onClick={() => setOpen((current) => !current)} style={styles.sectionButton}>
        <span>{title}</span>
        <span>{open ? 'v' : '>'}</span>
      </button>
      {open && <div style={styles.sectionBody}>{children}</div>}
    </section>
  )
}
