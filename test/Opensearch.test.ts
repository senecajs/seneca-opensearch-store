/* Copyright © 2024 Seneca Project Contributors, MIT License. */

require('dotenv').config({ path: '.env.local' })
// console.log(process.env) // remove this


import Seneca from 'seneca'
// import SenecaMsgTest from 'seneca-msg-test'
// import { Maintain } from '@seneca/maintain'

import OpensearchStoreDoc from '../src/OpensearchStoreDoc'
import OpensearchStore from '../src/OpensearchStore'



describe('OpensearchStore', () => {
  test('load-plugin', async () => {
    expect(OpensearchStore).toBeDefined()
    expect(OpensearchStoreDoc).toBeDefined()

    const seneca = Seneca({ legacy: false })
      .test()
      .use('promisify')
      .use('entity')
      .use(OpensearchStore, {

      })
    await seneca.ready()
  })

  test('utils.resolveIndex', () => {
    const utils = OpensearchStore['utils']
    const resolveIndex = utils.resolveIndex
    const seneca = makeSeneca()
    const ent0 = seneca.make('foo')
    const ent1 = seneca.make('foo/bar')

    expect(resolveIndex(ent0, { index: {} })).toEqual('foo')
    expect(resolveIndex(ent0, { index: { exact: 'qaz' } })).toEqual('qaz')

    expect(resolveIndex(ent1, { index: {} })).toEqual('foo_bar')
    expect(resolveIndex(ent1, { index: { prefix: 'p0', suffix: 's0' } })).toEqual('p0_foo_bar_s0')
    expect(resolveIndex(ent1, {
      index: { map: { '-/foo/bar': 'FOOBAR' }, prefix: 'p0', suffix: 's0' }
    }))
      .toEqual('FOOBAR')
  })


  test('insert-remove', async () => {
    const seneca = await makeSeneca()
    const list0 = await seneca.entity('foo/chunk').list$()
    // console.log(list0)
    expect(0 === list0.length)

    const list1 = await seneca.entity('foo/chunk').list$({ test: true })
    // console.log(list1)

    // if(0 === list.length) {}

  })
})


function makeSeneca() {
  return Seneca({ legacy: false })
    .test()
    .use('promisify')
    .use('entity')
    .use(OpensearchStore, {
      map: {
        'foo/chunk': '*'
      },
      index: {
        exact: process.env.SENECA_OPENSEARCH_TEST_INDEX,
      },
      opensearch: {
        node: process.env.SENECA_OPENSEARCH_TEST_NODE,
      }
    })
}


const index_test01 = {
  "mappings": {
    "properties": {
      "text": { "type": "text" },
      "vector": {
        "type": "knn_vector",
        "dimension": 8, // 1536,
        "method": {
          "engine": "nmslib",
          "space_type": "cosinesimil",
          "name": "hnsw",
          "parameters": { "ef_construction": 512, "m": 16 }
        }
      }
    }
  },
  "settings": {
    "index": {
      "number_of_shards": 2,
      "knn.algo_param": { "ef_search": 512 },
      "knn": true
    }
  }
}
