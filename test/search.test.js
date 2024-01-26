'use strict'

const assert = require('chai').assert
const testdata = require('./testdata')
const fs = require('fs')
const path = require('path')

const { HighlightStyle, SearchRequest } = require('../lib/searchtypes')
const { VectorQuery, VectorSearch } = require('../lib/vectorsearch')

const H = require('./harness')

describe('#search', function () {
  let testUid, idxName
  let testDocs
  let indexParams

  before(async function () {
    H.skipIfMissingFeature(this, H.Features.Search)

    testUid = H.genTestKey()
    idxName = 's_' + H.genTestKey() // prefix with a letter

    testDocs = await testdata.upsertData(H.dco, testUid)
    const indexPath = path.join(
      process.cwd(),
      'test',
      'data',
      'search_index.json'
    )
    const indexData = fs.readFileSync(indexPath)
    indexParams = JSON.parse(indexData)
    // need to swap out the type mapping to match the testUid
    indexParams.mapping.types[`${testUid.substring(0, 8)}`] =
      indexParams.mapping.types['testIndexUUID']
    delete indexParams.mapping.types['testIndexUUID']
  })

  after(async function () {
    await testdata.removeTestData(H.dco, testDocs)
  })

  it('should successfully create an index', async function () {
    await H.c.searchIndexes().upsertIndex({
      name: idxName,
      sourceName: H.b.name,
      sourceType: 'couchbase',
      type: 'fulltext-index',
      params: indexParams,
    })
  })

  it('should successfully get all indexes', async function () {
    const idxs = await H.c.searchIndexes().getAllIndexes()
    assert.isAtLeast(idxs.length, 1)
  })

  it('should successfully get an index', async function () {
    const idx = await H.c.searchIndexes().getIndex(idxName)
    assert.equal(idx.name, idxName)
  })

  it('should see test data correctly', async function () {
    /* eslint-disable-next-line no-constant-condition */
    while (true) {
      var res = null
      try {
        res = await H.c.searchQuery(
          idxName,
          H.lib.SearchQuery.term(testUid).field('testUid'),
          {
            explain: true,
            fields: ['name'],
            includeLocations: true,
            highlight: { style: HighlightStyle.HTML },
          }
        )
      } catch (e) {} // eslint-disable-line no-empty

      if (!res || res.rows.length !== testdata.docCount()) {
        await H.sleep(100)
        continue
      }

      assert.isArray(res.rows)
      assert.lengthOf(res.rows, testdata.docCount())
      assert.isObject(res.meta)

      res.rows.forEach((row) => {
        assert.isString(row.index)
        assert.isString(row.id)
        assert.isNumber(row.score)
        if (row.locations) {
          for (const loc of row.locations) {
            assert.isObject(loc)
          }
          assert.isArray(row.locations)
        }
        if (row.fragments) {
          assert.isObject(row.fragments)
        }
        if (row.fields) {
          assert.isObject(row.fields)
        }
        if (row.explanation) {
          assert.isObject(row.explanation)
        }
      })

      break
    }
  }).timeout(60000)

  it('should successfully drop an index', async function () {
    await H.c.searchIndexes().dropIndex(idxName)
  })

  it('should fail to drop a missing index', async function () {
    await H.throwsHelper(async () => {
      await H.c.searchIndexes().dropIndex(idxName)
    }, H.lib.SearchIndexNotFoundError)
  })
})

describe('#vectorsearch', function () {
  let testUid, idxName
  let testDocs
  let testVector
  let indexParams

  before(async function () {
    H.skipIfMissingFeature(this, H.Features.VectorSearch)

    testUid = H.genTestKey()
    idxName = 'vs_' + H.genTestKey() // prefix with a letter

    const testVectorSearchDocsPath = path.join(
      process.cwd(),
      'test',
      'data',
      'test_vector_search_docs.json'
    )
    const testVectorDocs = fs
      .readFileSync(testVectorSearchDocsPath, 'utf8')
      .split('\n')
      .map((l) => JSON.parse(l))
    testDocs = await testdata.upserDataFromList(H.dco, testUid, testVectorDocs)

    const testVectorPath = path.join(
      process.cwd(),
      'test',
      'data',
      'test_vector.json'
    )
    testVector = JSON.parse(fs.readFileSync(testVectorPath, 'utf8'))

    const indexPath = path.join(
      process.cwd(),
      'test',
      'data',
      'vector_search_index.json'
    )

    indexParams = JSON.parse(fs.readFileSync(indexPath))
    // need to swap out the type mapping to match the testUid
    indexParams.mapping.types[`${testUid.substring(0, 8)}`] =
      indexParams.mapping.types['testIndexUUID']
    delete indexParams.mapping.types['testIndexUUID']
  })

  after(async function () {
    await testdata.removeTestData(H.dco, testDocs)
  })

  it('should handle invalid SearchRequest', function () {
    assert.throws(() => {
      new SearchRequest(null)
    }, H.lib.InvalidArgumentError)
    assert.throws(() => {
      new SearchRequest(undefined)
    }, H.lib.InvalidArgumentError)
    assert.throws(() => {
      new SearchRequest({})
    }, H.lib.InvalidArgumentError)
    assert.throws(() => {
      SearchRequest.create(null)
    }, H.lib.InvalidArgumentError)
    assert.throws(() => {
      SearchRequest.create(undefined)
    }, H.lib.InvalidArgumentError)
    assert.throws(() => {
      SearchRequest.create({})
    }, H.lib.InvalidArgumentError)

    const vectorSearch = VectorSearch.fromVectorQuery(
      new VectorQuery('vector_field', testVector)
    )
    const searchQuery = new H.lib.MatchAllSearchQuery()

    assert.throws(() => {
      const req = SearchRequest.create(vectorSearch)
      req.withSearchQuery(vectorSearch)
    }, H.lib.InvalidArgumentError)
    assert.throws(() => {
      const req = SearchRequest.create(vectorSearch)
      req.withVectorSearch(searchQuery)
    }, H.lib.InvalidArgumentError)
    assert.throws(() => {
      const req = SearchRequest.create(vectorSearch)
      req.withVectorSearch(vectorSearch)
    }, H.lib.InvalidArgumentError)

    assert.throws(() => {
      const req = SearchRequest.create(searchQuery)
      req.withVectorSearch(searchQuery)
    }, H.lib.InvalidArgumentError)
    assert.throws(() => {
      const req = SearchRequest.create(searchQuery)
      req.withSearchQuery(vectorSearch)
    }, H.lib.InvalidArgumentError)
    assert.throws(() => {
      const req = SearchRequest.create(searchQuery)
      req.withSearchQuery(searchQuery)
    }, H.lib.InvalidArgumentError)
  })

  it('should handle invalid VectorQuery', function () {
    assert.throws(() => {
      new VectorQuery('vector_field', null)
    }, H.lib.InvalidArgumentError)
    assert.throws(() => {
      new VectorQuery('vector_field', undefined)
    }, H.lib.InvalidArgumentError)
    assert.throws(() => {
      new VectorQuery('vector_field', {})
    }, H.lib.InvalidArgumentError)
    assert.throws(() => {
      new VectorQuery('vector_field', [])
    }, H.lib.InvalidArgumentError)
    assert.throws(() => {
      const vQuery = new VectorQuery('vector_field', testVector)
      vQuery.numCandidates(0)
    }, H.lib.InvalidArgumentError)
    assert.throws(() => {
      const vQuery = new VectorQuery('vector_field', testVector)
      vQuery.numCandidates(-1)
    }, H.lib.InvalidArgumentError)
  })

  it('should successfully create an index', async function () {
    await H.c.searchIndexes().upsertIndex({
      name: idxName,
      sourceName: H.b.name,
      sourceType: 'couchbase',
      type: 'fulltext-index',
      params: indexParams,
    })
  })

  it('should see test data correctly', async function () {
    const vectorSearch = VectorSearch.fromVectorQuery(
      new VectorQuery('vector_field', testVector)
    )
    const request = SearchRequest.create(vectorSearch)
    request.withSearchQuery(H.lib.SearchQuery.term(testUid).field('testUid'))
    const limit = 2
    /* eslint-disable-next-line no-constant-condition */
    while (true) {
      var res = null
      try {
        res = await H.c.search(idxName, request, {
          limit: limit,
          explain: true,
          fields: ['text'],
          includeLocations: true,
          highlight: { style: HighlightStyle.HTML },
        })
      } catch (e) {} // eslint-disable-line no-empty

      if (!res || res.rows.length < limit) {
        await H.sleep(100)
        continue
      }

      assert.isArray(res.rows)
      assert.isAtLeast(res.rows.length, limit)
      assert.isObject(res.meta)

      res.rows.forEach((row) => {
        assert.isString(row.index)
        assert.isString(row.id)
        assert.isNumber(row.score)
        if (row.locations) {
          for (const loc of row.locations) {
            assert.isObject(loc)
          }
          assert.isArray(row.locations)
        }
        if (row.fragments) {
          assert.isObject(row.fragments)
        }
        if (row.fields) {
          assert.isObject(row.fields)
        }
        if (row.explanation) {
          assert.isObject(row.explanation)
        }
      })

      break
    }
  }).timeout(60000)

  it('should successfully drop an index', async function () {
    await H.c.searchIndexes().dropIndex(idxName)
  })
})
