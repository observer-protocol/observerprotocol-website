// Endpoint-free verification of the hosted PolicyEvaluationCredential, using the
// canonical W3C Data Integrity reference libraries (@digitalbazaar). This proves
// the page's claim: "you do not even need our endpoint" — the eddsa-jcs-2022
// proof verifies against the published DID with standard tooling alone.
//
// Sources (hosting, NOT the OP verify endpoint):
//   PEC: https://observerprotocol.org/credentials/maxi-0001-wdk-demo-pec.json
//   DID: https://observerprotocol.org/.well-known/did.json
// Override with PEC_URL / DID_URL to verify a local file (file://...).
import { DataIntegrityProof } from '@digitalbazaar/data-integrity'
import { createVerifyCryptosuite } from '@digitalbazaar/eddsa-jcs-2022-cryptosuite'
import jsigs from 'jsonld-signatures'
import { readFileSync } from 'node:fs'

const PEC_URL = process.env.PEC_URL || 'https://observerprotocol.org/credentials/maxi-0001-wdk-demo-pec.json'
const DID_URL = process.env.DID_URL || 'https://observerprotocol.org/.well-known/did.json'

async function load (url) {
  if (url.startsWith('file://')) return JSON.parse(readFileSync(new URL(url), 'utf8'))
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`)
  return res.json()
}

const pec = await load(PEC_URL)
const didDoc = await load(DID_URL)

// Serve the DID doc as the controller, and each verificationMethod as a Multikey
// (the eddsa-jcs-2022 cryptosuite expects Multikey; the published doc uses
// Ed25519VerificationKey2020 — same publicKeyMultibase, just relabel the type).
const vmById = new Map()
for (const vm of didDoc.verificationMethod || []) {
  vmById.set(vm.id, {
    '@context': 'https://w3id.org/security/multikey/v1',
    id: vm.id,
    type: 'Multikey',
    controller: vm.controller,
    publicKeyMultibase: vm.publicKeyMultibase
  })
}

async function documentLoader (url) {
  if (url === didDoc.id) return { contextUrl: null, documentUrl: url, document: didDoc }
  if (vmById.has(url)) return { contextUrl: null, documentUrl: url, document: vmById.get(url) }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`documentLoader fetch ${url} -> ${res.status}`)
  return { contextUrl: null, documentUrl: url, document: await res.json() }
}

const suite = new DataIntegrityProof({ cryptosuite: createVerifyCryptosuite() })
const result = await jsigs.verify(pec, {
  suite,
  purpose: new jsigs.purposes.AssertionProofPurpose(),
  documentLoader
})

console.log('credential:', pec.type?.join('/'))
console.log('proof:', pec.proof?.type, '/', pec.proof?.cryptosuite, '->', pec.proof?.verificationMethod)
console.log('canonical @digitalbazaar Data Integrity verify ->', result.verified)
if (!result.verified) {
  console.error(JSON.stringify(result.error?.errors?.map(e => e.message) ?? result.error?.message ?? result, null, 2))
  process.exit(1)
}
