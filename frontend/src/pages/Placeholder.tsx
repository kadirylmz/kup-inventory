import { Construction } from 'lucide-react'

export default function Placeholder({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      <div className="grid place-items-center rounded-xl border border-dashed border-slate-300 p-16 text-center dark:border-slate-700">
        <Construction className="mb-3 h-8 w-8 text-slate-400" />
        <p className="font-medium">Bu modül henüz geliştirilmedi.</p>
        <p className="text-sm text-slate-500">Planlanan aşama: {phase}</p>
      </div>
    </div>
  )
}
