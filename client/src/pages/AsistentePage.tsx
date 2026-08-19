import { useRef, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
} from '@databricks/appkit-ui/react';
import { Bot, Send, User } from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader } from '../components/ui-kit';

interface Turno {
  id: string;
  rol: 'usuario' | 'asistente';
  texto: string;
  fuente?: string;
  disponible?: boolean;
}

let turnoSeq = 0;
const nuevoId = () => `t-${++turnoSeq}`;

const SUGERENCIAS = [
  'Cuales rutas debo subir de precio',
  'Cual es la ocupacion de BOG-MIA',
  'Cuanto revenue genero el mes',
  'Que rutas tienen alertas abiertas',
];

export function AsistentePage() {
  const [turnos, setTurnos] = useState<Turno[]>([
    {
      id: nuevoId(),
      rol: 'asistente',
      texto: 'Hola. Soy el asistente de revenue en modo demo: respondo con consultas fijas sobre las tablas gold. Si un dato no existe, te digo "No disponible" en vez de inventarlo.',
      fuente: 'demo',
      disponible: true,
    },
  ]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);

  const preguntar = async (pregunta: string) => {
    const q = pregunta.trim();
    if (!q || enviando) return;
    setTexto('');
    setTurnos((t) => [...t, { id: nuevoId(), rol: 'usuario', texto: q }]);
    setEnviando(true);
    try {
      const r = await api.ask(q);
      setTurnos((t) => [...t, { id: nuevoId(), rol: 'asistente', texto: r.texto, fuente: r.fuente, disponible: r.disponible }]);
    } catch (e) {
      setTurnos((t) => [...t, { id: nuevoId(), rol: 'asistente', texto: e instanceof Error ? e.message : 'Error', fuente: 'error', disponible: false }]);
    } finally {
      setEnviando(false);
      setTimeout(() => finRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        title="Asistente conversacional"
        subtitle="Modo demo, determinista y sin dependencias externas. Los conectores a Genie y a un modelo servido estan documentados pero desactivados."
        actions={<Badge variant="secondary">Modo demo</Badge>}
      />

      <Card className="shadow-sm">
        <CardContent className="p-4">
          <div className="space-y-4 min-h-[320px] max-h-[52vh] overflow-y-auto pr-1">
            {turnos.map((t) => (
              <div key={t.id} className={`flex gap-3 ${t.rol === 'usuario' ? 'flex-row-reverse' : ''}`}>
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: t.rol === 'usuario' ? 'var(--muted)' : 'var(--primary)',
                    color: t.rol === 'usuario' ? 'var(--muted-foreground)' : 'var(--primary-foreground)',
                  }}
                >
                  {t.rol === 'usuario' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>
                <div className={`rounded-lg px-3 py-2 text-sm max-w-[80%] ${t.rol === 'usuario' ? 'bg-muted' : 'bg-card border border-border'}`}>
                  <p className="whitespace-pre-wrap text-foreground">{t.texto}</p>
                  {t.rol === 'asistente' && t.fuente && t.fuente !== 'demo' && (
                    <p className="text-[11px] text-muted-foreground mt-1">Fuente: {t.fuente}</p>
                  )}
                </div>
              </div>
            ))}
            <div ref={finRef} />
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            {SUGERENCIAS.map((s) => (
              <button
                key={s}
                onClick={() => void preguntar(s)}
                disabled={enviando}
                className="text-xs rounded-full border border-border px-3 py-1 text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>

          <form
            className="flex gap-2 mt-3"
            onSubmit={(e) => { e.preventDefault(); void preguntar(texto); }}
          >
            <Input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Escribe tu pregunta sobre rutas, ocupacion o revenue"
              disabled={enviando}
            />
            <Button type="submit" disabled={enviando || !texto.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
