/* Copyright (c) 2024 Seneca contributors, MIT License */


import { AwsSigv4Signer } from '@opensearch-project/opensearch/aws'
import { Client } from '@opensearch-project/opensearch'
import { defaultProvider } from '@aws-sdk/credential-provider-node'

import { Gubu } from 'gubu'

const { Open, Any } = Gubu


type Options = {
  debug: boolean
  map?: any
  index: {
    prefix: string
    suffix: string
    map: Record<string, string>,
    exact: string
  },
  field: {
    zone: { name: string },
    base: { name: string },
    name: { name: string },
    vector: { name: string },
  }
  cmd: {
    list: {
      size: number
    }
  }
  aws: any
  opensearch: any
}

export type OpensearchStoreOptions = Partial<Options>


function OpensearchStore(this: any, options: Options) {
  const seneca: any = this

  const init = seneca.export('entity/init')

  let desc: any = 'OpensearchStore'

  let client: any


  let store = {
    name: 'OpensearchStore',

    save: function (this: any, msg: any, reply: any) {
      // const seneca = this
      const ent = msg.ent

      const canon = ent.canon$({ object: true })
      const index = resolveIndex(ent, options)

      const body = ent.data$(false)

      const fieldOpts: any = options.field

        ;['zone', 'base', 'name']
          .forEach((n: string) => {
            if ('' != fieldOpts[n].name && null != canon[n] && '' != canon[n]) {
              body[fieldOpts[n]] = canon[n]
            }
          })

      const req = {
        index,
        body,
      }

      client.index(req)
        .then((res: any) => {
          const body = res.body
          ent.data$(body._source)
          ent.id = body._id
          reply(ent)
        })
        .catch((err: any) => reply(err))
    },


    load: function (this: any, msg: any, reply: any) {
      // const seneca = this
      const ent = msg.ent

      // const canon = ent.canon$({ object: true })
      const index = resolveIndex(ent, options)

      let q = msg.q || {}

      if (null != q.id) {
        client.get({
          index,
          id: q.id
        })
          .then((res: any) => {
            const body = res.body
            ent.data$(body._source)
            ent.id = body._id
            reply(ent)
          })
          .catch((err: any) => {
            // Not found
            if (err.meta && 404 === err.meta.statusCode) {
              reply(null)
            }

            reply(err)
          })
      }
      else {
        reply()
      }
    },


    list: function (msg: any, reply: any) {
      // const seneca = this
      const ent = msg.ent

      // const canon = ent.canon$({ object: true })
      const index = resolveIndex(ent, options)

      let q = msg.q || {}

      let query: any = {
        index,
        body: {
          size: msg.size$ || options.cmd.list.size,
          _source: {
            excludes:
              [options.field.vector.name].filter(n => '' !== n)
          },
          query: {},
        }
      }

      let excludeKeys: any = { directive$: 1, vector: 1 }

      for (let k in q) {
        if (!excludeKeys[k]) {
          query.body.query.match = (query.body.query.match || {})
          query.body.query.match[k] = q[k]
        }
      }

      if (msg.vector$ || q.directive$?.vector$) {
        query.body.query.knn = {
          vector: { vector: q.vector, k: 15 }
        }
      }


      // console.log('QUERY', query)

      if (0 === Object.keys(query.body.query).length) {
        return reply([])
      }


      client
        .search(query)
        .then((res: any) => {
          const hits = res.body.hits
          const list = hits.hits.map((entry: any) => {
            let item = ent.make$().data$(entry._source)
            item.id = entry._id
            item.custom$({ score: entry._score })
            return item
          })
          reply(list)
        })
        .catch((err: any) => {
          reply(err)
        })
    },


    remove: function (this: any, msg: any, reply: any) {
      // const seneca = this
      const ent = msg.ent

      // const canon = ent.canon$({ object: true })
      const index = resolveIndex(ent, options)

      let q = msg.q || {}

      if (null != q.id) {
        client.delete({
          index,
          id: q.id
        })
          .then((_res: any) => {
            reply(null)
          })
          .catch((err: any) => {
            // Not found
            if (err.meta && 404 === err.meta.statusCode) {
              reply(null)
            }

            reply(err)
          })
      }
      else {
        reply()
      }
    },


    close: function (this: any, _msg: any, reply: any) {
      this.log.debug('close', desc)
      reply()
    },


    native: function (this: any, _msg: any, reply: any) {
      reply(null, {
        client: () => client
      })
    },
  }

  let meta = init(seneca, options, store)

  desc = meta.desc


  seneca.prepare(async function (this: any) {
    const region = options.aws.region
    const node = options.opensearch.node

    client = new Client({
      ...AwsSigv4Signer({
        region,
        service: 'aoss',
        getCredentials: () => {
          const credentialsProvider = defaultProvider()
          return credentialsProvider()
        }
      }),
      node
    })
  })

  return {
    name: store.name,
    tag: meta.tag,
    exportmap: {
      native: () => ({
        client
      })
    },
  }
}


function resolveIndex(ent: any, options: Options) {
  let indexOpts = options.index
  if ('' != indexOpts.exact && null != indexOpts.exact) {
    return indexOpts.exact
  }

  let canonstr = ent.canon$({ string: true })
  indexOpts.map = indexOpts.map || {}
  if ('' != indexOpts.map[canonstr] && null != indexOpts.map[canonstr]) {
    return indexOpts.map[canonstr]
  }

  let prefix = indexOpts.prefix
  let suffix = indexOpts.suffix

  prefix = ('' == prefix || null == prefix) ? '' : prefix + '_'
  suffix = ('' == suffix || null == suffix) ? '' : '_' + suffix

  // TOOD: need ent.canon$({ external: true }) : foo/bar -> foo_bar
  let infix = ent.canon$({ string: true }).replace(/-\//g, '').replace(/\//g, '_')

  return prefix + infix + suffix
}



// Default options.
const defaults: Options = {
  debug: false,
  map: Any(),
  index: {
    prefix: '',
    suffix: '',
    map: {},
    exact: '',
  },

  // '' === name => do not inject
  field: {
    zone: { name: 'zone' },
    base: { name: 'base' },
    name: { name: 'name' },
    vector: { name: 'vector' },
  },

  cmd: {
    list: {
      size: 11,
    },
  },

  aws: Open({
    region: 'us-east-1'
  }),

  opensearch: Open({
    node: 'NODE-URL',
  }),
}


Object.assign(OpensearchStore, {
  defaults,
  utils: { resolveIndex },
})

export default OpensearchStore

if ('undefined' !== typeof module) {
  module.exports = OpensearchStore
}

