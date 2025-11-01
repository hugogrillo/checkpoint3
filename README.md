---

## Validação local e evidências (Windows PowerShell)

Esta seção reúne os comandos que executei localmente para validar o projeto, junto com trechos de saída (evidências) que comprovam que a API, o PostgreSQL e as métricas funcionam.

1) Subir containers com Docker Compose

```powershell
docker-compose -f docker\docker-compose.yml up --build -d
```

2) Verificar containers (exemplo de saída):

```text
NAMES         IMAGE                    STATUS          PORTS
unifiap_api   unifiap-pay-api:latest   Up 47 minutes   0.0.0.0:3000->3000/tcp, [::]:3000->3000/tcp
unifiap_db    postgres:15-alpine       Up 47 minutes   5432/tcp
```

3) Logs da API (trecho):

```text
API listening on port 3000
```

4) Criar pagamento de teste (PowerShell):

```powershell
# POST um pagamento de exemplo
Invoke-RestMethod -Uri 'http://localhost:3000/payments' -Method Post -Body (ConvertTo-Json @{ amount=42.5; pix_key='validator@pix' }) -ContentType 'application/json'
```

Exemplo de resposta (ID retornado):

```text
id                                   status 
--                                   ------
a18c0375-92e6-4f99-a9e9-fa2ad656e551 created
```

5) Listar pagamentos para validar persistência:

```powershell
Invoke-RestMethod -Uri 'http://localhost:3000/payments' -Method Get
```

Exemplo de saída (JSON):

```json
[
	{
		"id": "a18c0375-92e6-4f99-a9e9-fa2ad656e551",
		"amount": "42.5",
		"pix_key": "validator@pix",
		"status": "created",
		"created_at": "2025-11-01T20:17:12.536Z"
	}
]
```

6) Métricas Prometheus (após rebuild da imagem com `prom-client`):

```powershell
curl.exe http://localhost:3000/metrics
```

Trecho das métricas retornadas (exemplo):

```text
 # HELP unifiap_payments_created_total Total number of payments created
 # TYPE unifiap_payments_created_total counter
 unifiap_payments_created_total 1
```

Observação: a métrica `unifiap_payments_created_total` é incrementada quando você cria pagamentos via POST. Se o servidor for reiniciado, o contador é reiniciado (comportamento padrão em memória).

7) Tag da imagem pronta para Docker Hub (local):

```powershell
# tag local para o seu repositório no Docker Hub
docker tag unifiap-pay-api:latest hugo677/checkpoint3:latest

# listar imagens (exemplo de saída)
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"
```

Exemplo de saída `docker images` (trecho):

```text
REPOSITORY                                  TAG                SIZE
unifiap-pay-api                             latest             192MB
hugo677/checkpoint3                         latest             188MB
```

8) Push para Docker Hub (manual — requer login):

```powershell
# faça login antes
docker login --username hugo677
# em seguida
docker push hugo677/checkpoint3:latest
```

9) Deploy em minikube (resumo de comandos já no README):

```powershell
kubectl apply -f K85\01-namespace-config.yaml
kubectl apply -f K85\02-postgres.yaml
kubectl apply -f K85\03-api.yaml
kubectl apply -f K85\servicemonitor.yaml
kubectl port-forward svc/unifiap-api-svc 3000:3000 -n unifiappay
curl.exe http://localhost:3000/health
```

Notas finais sobre evidências
- Os trechos acima foram coletados durante uma sessão local de validação. Para preparar o pacote de evidências que será apresentado (prints/logs), recomendo salvar a saída dos comandos em arquivos (`> filename.txt`) e capturar screenshots dos comandos `kubectl get pods -n unifiappay` e `kubectl logs -n unifiappay deployment/unifiap-api`.
- Se quiser, eu posso adicionar exemplos de arquivos de evidência na pasta `evidence/` do repositório (logs, outputs), ou criar scripts PowerShell (`scripts\validate.ps1`) para automatizar a execução e coleta das saídas.

# UniFIAP Pay - Sample Project

Esse repositório contém um projeto mínimo para a Fintech *UniFIAP Pay* com: API containerizada, Docker Compose para testes locais e manifests Kubernetes para deploy em minikube.

Estrutura do repositório

- `/src` - código da API Node.js (Express) que persiste pagamentos em PostgreSQL
- `/docker` - `Dockerfile` multi-stage e `docker-compose.yml` para testes locais
- `/K85` - 3 manifests Kubernetes (namespace/configs, postgres+pv/pvc, api+job+daemonset)

Observação: fiz uma escolha técnica razoável: API em Node.js + Postgres para simular transações PIX. Usei imagens oficiais (postgres, busybox) e um Dockerfile multi-stage com usuário não-root.

CONTRATO RÁPIDO (inputs/outputs)
- Entrada: POST /payments { amount, pix_key }
- Saída: 201 { id, status }
- Erros: 400 (campos faltando), 500 (erro DB)

Edge cases considerados
- Falha de conexão com o banco (500)
- Campos ausentes (400)
- Persistência via PVC no minikube (hostPath)

---
## Pré-requisitos

- Docker Desktop (Windows) ou Docker
- docker-compose
- minikube
- kubectl
- conta no Docker Hub (para publicar a imagem)

## 1) Teste local com Docker Compose

1. Construa e suba containers (do diretório do repo root):

```powershell
# substitua YOUR_DOCKERHUB_USERNAME antes de buildar se quiser marcar a imagem corretamente
docker-compose -f docker\docker-compose.yml up --build -d
```

2. Verifique containers:

```powershell
docker ps
```

3. Teste API:

```powershell
curl -X GET http://localhost:3000/health
curl -X POST http://localhost:3000/payments -H "Content-Type: application/json" -d '{"amount":100.50,"pix_key":"abc@pix"}'
curl -X GET http://localhost:3000/payments
```
![pagamento](checkpoint3/images/pagamentos.png)


4. Logs e evidências: capture `docker logs unifiap_api` e `docker logs unifiap_db` e faça prints.

5. Para parar e remover:

```powershell
docker-compose -f docker\docker-compose.yml down -v
```



## 3) Deploy em minikube

1. Inicie minikube (exemplo):

```powershell
minikube start --driver= hyperv
```

2. Carregue a imagem no minikube (opção A - se já tiver push no Docker Hub, pule este passo):

```powershell
# se construiu localmente e quer carregar para o minikube
minikube image load YOUR_DOCKERHUB_USERNAME/unifiap-pay-api:latest
```

ou (opção B) usar o docker do minikube para buildar lá:

```powershell
& minikube -p minikube docker-env | Invoke-Expression
# depois rode o build local apontando pro contexto que contenha o Dockerfile
docker build -f docker\Dockerfile -t unifiap-pay-api:latest ..
```

3. Crie namespace e recursos:

```powershell
kubectl apply -f K85\01-namespace-config.yaml
kubectl apply -f K85\02-postgres.yaml
kubectl apply -f K85\03-api.yaml
```

4. Validando recursos e evidências (exemplos):

```powershell
kubectl get ns
kubectl get all -n unifiappay
kubectl get pv,pvc -n unifiappay
kubectl logs -n unifiappay deployment/unifiap-api
kubectl describe deployment/unifiap-api -n unifiappay
kubectl get pods -n unifiappay -o wide
kubectl logs -n unifiappay daemonset/log-collector
kubectl get jobs -n unifiappay
kubectl logs -n unifiappay job/audit-job
```

Capturas de tela: execute os comandos acima e salve os outputs/prints.

5. Acessando a API no cluster (port-forward):

```powershell
kubectl port-forward svc/unifiap-api-svc 3000:3000 -n unifiappay
# agora no host: http://localhost:3000
curl http://localhost:3000/health
```

## 4) Segurança, limites e boas práticas aplicadas

- Dockerfile multi-stage para reduzir tamanho e separar dependências.
- Container roda com usuário não-root (UID 1000).
- Secrets em Kubernetes para credenciais do Postgres.
- Resource requests/limits no Deployment da API.
- PV/PVC para persistência do Postgres (hostPath para minikube). Em cloud use StorageClass apropriado.
- DaemonSet simples para evidência de monitoramento e Job de auditoria programado/manualmente.

## 5) Testes e validação

![test_pix](checkpoint3/images/test_pix.png)

- Teste funcional: POST /payments e GET /payments (veja acima).
- Verifique persistência: apagar pod do Postgres e ver se dados permanecem (depende do hostPath).
- Comandos de evidência: salvar outputs de `kubectl get pods -n unifiappay` e `kubectl logs`.


## Próximos passos sugeridos

- Adicionar TLS (Ingress + cert-manager) para tráfego seguro.
- Implementar CI/CD (GitHub Actions) para build e push automático.
- Integrar Prometheus/Grafana para monitoramento real.
- Harden the container: use distroless or gcr.io/distroless/nodejs for final image.

---

## CI/CD (GitHub Actions)

Incluí um workflow de exemplo em `.github/workflows/ci.yml` que:

- builda a imagem usando `docker/build-push-action`
- faz login no Docker Hub usando `secrets.DOCKERHUB_USERNAME` e `secrets.DOCKERHUB_TOKEN`
- faz push para `hugo677/checkpoint3:latest` e `hugo677/checkpoint3:<sha>`

Configurar segredos no repositório GitHub:

1. Vá em Settings → Secrets and variables → Actions → New repository secret.
2. Adicione `DOCKERHUB_USERNAME` = `hugo677` e `DOCKERHUB_TOKEN` = seu token do Docker Hub.

Depois de configurar, qualquer push em `main` acionará o workflow.

## Grafana (monitoramento)

1. Para que o Prometheus colete métricas da API, existe um `ServiceMonitor` de exemplo em `K85/servicemonitor.yaml`. Ele depende do Prometheus Operator. Após instalar o stack, aplique:

```powershell
kubectl apply -f K85/servicemonitor.yaml
```
![metricas](CHECKPOINT3/images/metricas.png)

2. A API já expõe `/metrics`. Você pode criar um dashboard no Grafana ou importar dashboards prontos. Use `metrics` do namespace `unifiappay` como fonte.






