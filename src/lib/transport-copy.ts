export function transportMessage(locale: string | null, kind: string, student: string, stop: string, actor = '') {
  const lang = locale === 'ms' || locale === 'zh' ? locale : 'en'
  const content = {
    en: { PICKED_UP: [`Boarded: ${student}`, `${actor} confirmed ${student} boarded at ${stop}.`], DROPPED_OFF: [`Dropped off: ${student}`, `${actor} confirmed ${student} got off at ${stop}.`], ABSENT: [`Absent: ${student}`, `${actor} marked ${student} absent.`], BUS_ETA_5_MIN: ['Bus arriving in about 5 minutes', `${student}'s bus is approaching ${stop}. Please be ready.`] },
    ms: { PICKED_UP: [`Sudah naik: ${student}`, `${actor} mengesahkan ${student} menaiki bas di ${stop}.`], DROPPED_OFF: [`Sudah turun: ${student}`, `${actor} mengesahkan ${student} turun di ${stop}.`], ABSENT: [`Tidak hadir: ${student}`, `${actor} menandakan ${student} tidak hadir.`], BUS_ETA_5_MIN: ['Bas tiba dalam kira-kira 5 minit', `Bas ${student} menghampiri ${stop}. Sila bersedia.`] },
    zh: { PICKED_UP: [`已上车：${student}`, `${actor}确认${student}已在${stop}上车。`], DROPPED_OFF: [`已下车：${student}`, `${actor}确认${student}已在${stop}下车。`], ABSENT: [`缺席：${student}`, `${actor}已将${student}标记为缺席。`], BUS_ETA_5_MIN: ['校车约5分钟后到达', `${student}的校车正在接近${stop}，请做好准备。`] },
  }
  const [title, body] = content[lang][kind as keyof typeof content.en] || [kind, student]
  return { title, body }
}
