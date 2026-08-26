/**
 * Resumo de execução de um projeto.
 *
 * O percentual que existe hoje no canto do mapa é global: mede a rede inteira.
 * Numa rede com milhares de elementos ele praticamente não se move, e por isso
 * não diz nada. O que importa é o percentual do conjunto que está sendo
 * executado agora — a expansão de um bairro, um projeto.
 *
 * A conta vive aqui, pura, por dois motivos: o servidor a usa para responder à
 * tela, e os testes a exercitam sem banco nenhum. O banco só devolve contagens
 * cruas; a interpretação delas é decisão de produto e está toda neste arquivo.
 */

import {
  PROJECT_TIPOS,
  PROJECT_STATUS_DONE,
  normalizeProjectStatus,
  type ProjectStatus,
  type ProjectTipo,
} from "./projectStatus";

/** Quantos itens de um tipo estão em cada estado. Vem do banco assim. */
export type ContagemPorEstado = Partial<Record<ProjectStatus, number>>;

/** O que o banco devolve por projeto: contagens por tipo e estado. */
export type ContagensDoProjeto = Partial<Record<ProjectTipo, ContagemPorEstado>>;

export interface LinhaDoTipo {
  tipo: ProjectTipo;
  total: number;
  feitos: number;
}

export interface ResumoProjeto {
  /** Itens do projeto entre os cinco tipos com ciclo de vida. */
  total: number;
  /** Quantos estão implantados ou certificados. */
  feitos: number;
  /** 0 a 100, arredondado. Zero num projeto vazio — não 100. */
  percentual: number;
  /** Uma linha por tipo presente, na ordem de leitura de PROJECT_TIPOS. */
  porTipo: LinhaDoTipo[];
  /** Verdadeiro quando o projeto não tem nenhum item destes cinco tipos. */
  vazio: boolean;
}

function contaFeitos(contagem: ContagemPorEstado): { total: number; feitos: number } {
  let total = 0;
  let feitos = 0;
  for (const [estado, quantos] of Object.entries(contagem)) {
    const n = typeof quantos === "number" && Number.isFinite(quantos) ? quantos : 0;
    if (n <= 0) continue;
    total += n;
    // normalizeProjectStatus mapeia qualquer coisa desconhecida para o padrão
    // `deployed`. Linhas anteriores à v22 vêm com null e devem contar como
    // implantadas, porque tudo o que já estava cadastrado existe em campo.
    if (PROJECT_STATUS_DONE.includes(normalizeProjectStatus(estado))) feitos += n;
  }
  return { total, feitos };
}

/**
 * Transforma as contagens cruas do banco no resumo que a tela mostra.
 *
 * Tipos sem nenhum item são omitidos de `porTipo`: um projeto de expansão de
 * CTOs não deve exibir "0/0 reservas" só porque reservas existem no sistema.
 */
export function resumirProjeto(contagens: ContagensDoProjeto | null | undefined): ResumoProjeto {
  const porTipo: LinhaDoTipo[] = [];
  let total = 0;
  let feitos = 0;

  for (const tipo of PROJECT_TIPOS) {
    const contagem = contagens?.[tipo];
    if (!contagem) continue;
    const linha = contaFeitos(contagem);
    if (linha.total === 0) continue;
    porTipo.push({ tipo, total: linha.total, feitos: linha.feitos });
    total += linha.total;
    feitos += linha.feitos;
  }

  return {
    total,
    feitos,
    // Projeto vazio devolve 0, não 100: 100 significaria concluído, e um
    // projeto sem itens não está concluído — está por começar.
    percentual: total === 0 ? 0 : Math.round((feitos / total) * 100),
    porTipo,
    vazio: total === 0,
  };
}

/** "8/12 CTOs · 2/5 cabos" — a linha de contagem do painel. */
export function formatarContagem(
  resumo: ResumoProjeto,
  rotulos: Record<ProjectTipo, string>
): string {
  return resumo.porTipo.map(l => `${l.feitos}/${l.total} ${rotulos[l.tipo]}`).join(" · ");
}
