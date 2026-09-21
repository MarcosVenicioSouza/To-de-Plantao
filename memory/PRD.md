# EscalaFácil — Product Requirements

## Objetivo
Aplicativo mobile em português para técnicos de enfermagem gerenciarem escalas 12x36 e variações, com suporte a múltiplos locais de trabalho, trocas de plantão, plantões avulsos, férias e feriados.

## Fluxo do usuário
1. Cadastro/login com e-mail e senha (JWT, senha protegida com bcrypt).
2. Adicionar um ou mais locais de trabalho com sequência de plantão, horários e cores.
3. Visualizar o calendário mensal com plantões, folgas, férias e feriados destacados.
4. Editar qualquer dia (troca de escala SD↔SN, plantão avulso, férias, folga) via bottom sheet.
5. Ver relatório mensal de horas por local.
6. Gerenciar feriados personalizados (nacionais já vêm pré-carregados).
7. Ativar lembretes locais 1 hora antes de cada plantão.

## Funcionalidades
- **Autenticação**: e-mail + senha, JWT.
- **Locais de trabalho**: nome, cor, padrão de sequência (5 dias SD→F→SN→F→F padrão, 4 dias SD→SN→F→F, 4 dias 12x36 clássico), data inicial do ciclo, primeiro plantão (SD ou SN), horários SD/SN customizáveis, cores SD/SN/Avulso customizáveis, modo "somente avulso", períodos de férias.
- **Calendário mensal (PT-BR)**: grade 6×7 com datas em DD/MM/AAAA, hoje com borda destacada, fim de semana em vermelho, feriados com sombra âmbar, cores por tipo de plantão.
- **Duas escalas simultâneas**: seletor no topo permite escolher um 2º local; célula do dia dividida em metade superior/inferior.
- **Trocas / Edição**: bottom sheet contextual com SD, SN, Avulso (verde), Folga, Férias, horários HH:mm, colega de troca e observações.
- **Plantão avulso**: dois modos — local dedicado a avulsos OU marcar dia a dia em qualquer local.
- **Férias**: período (início/fim) por local; dia mostrado como "FÉRIAS" ocultando a escala.
- **Feriados**: lista fixa nacional (fixos + Carnaval, Sexta-Feira Santa, Corpus Christi computados via cálculo da Páscoa) + feriados personalizados via CRUD.
- **Relatórios**: total de horas do mês, contagem de SD, SN, Avulso, Folga e Férias.
- **Lembretes**: notificações locais 30 dias à frente, 1h antes de cada plantão.

## Tecnologia
- Backend: FastAPI + MongoDB (motor), JWT (PyJWT) + bcrypt.
- Frontend: Expo Router + React Native, @gorhom/bottom-sheet, expo-notifications, @react-native-vector-icons/ionicons.
- Idioma: Português Brasil, datas em DD/MM/AAAA.
