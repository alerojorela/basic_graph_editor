# CHANGELOG

## 2026-08-26 · El sitio queda al día, y el repositorio no

⚠️ **Veinticinco commits locales sin subir**, y el sitio publicado actualizado.
O sea que en este momento hay tres estados distintos: el árbol de trabajo, el
repositorio remoto y lo desplegado. Está apuntado en el índice de la casa como
aviso, y falta desplegar.

## El editor de grafos dirigidos

Editor en canvas con JavaScript a secas: **sin armazón y sin paso de
construcción**. Se abre el `index.html` y se dibuja.

**Lo que lo saca de ser una demostración son dos cosas medidas en uso**:

- **Aguanta 216 nodos** sin dejar de responder, que es el metro de Tokio, y trae
  buscador por etiqueta porque a esa escala encontrar un nodo a ojo deja de ser
  posible.
- **Un fichero puede traer varios grafos cotejables en paneles**, y ahí está el
  uso real: un análisis de dependencias al lado de su árbol de constituyentes,
  la misma oración vista de dos maneras.

**Y el no tener construcción no es pereza**: es lo que permite que el editor se
abra desde el disco, desde el sitio publicado o desde dentro de otra página sin
cambiar nada.
