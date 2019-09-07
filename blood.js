/**
 * Right Donor's Chaincode Application
 * Built by: Fernando Martin Garcia Del Angel
 * Built on: September 6th, 2019
 */

 'use strict'
 const shim = require('fabric-shim')
 const util = require('util')

 let chaincode = class {
     /**
      * Chaincode Instantiation Process
      * @param {Object} stub Instantiation Parameters
      * @returns {Boolean} Function Execution Success Flag
      */
     async Init(stub) {
         let ret = stub.getFunctionAndParameters()
         console.info(ret)
         console.info('===== Instantiated Blood Chaincode Successfully =====')
         console.info('============== Fernando Martin @ 2019 ===============')
         return shim.success()
     }

     /**
      * Chaincode Invocation Function
      * @param {Object} stub Invocation Parameters
      * @returns {Boolean} Function Execution Success Flag
      */
     async Invoke(stub) {
         console.info('Transaction ID:',stub.getTxID())
         console.info(util.format('Args: %j',stub.getArgs()))
        // Get the method and execute it
        let ret = stub.getFunctionAndParameters()
        let method = this[ret.fcn]
        if (!method) {
            throw new Error('Received unknown function named: '+ret.fcn)
        }
        // If method does exist, try to execute it
        try {
            let payload = await method(stub, ret.params,this)
            return shim.success(payload)
        } catch(err) {
            console.error(err)
            return shim.error(err)
        }
     }

     /**
      * Creates a new Blood Bag on the ledger
      * @param {Object} stub Chaincode code executor
      * @param {Object} args Bag Arguments such as bloodId, bloodLocation, bloodType, and BloodSize
      * @param {Object} thisClass References to this class
      * @returns {Boolean} Function Execution Success Flag
      */
     async createBloodBag(stub,args,thisClass){
        // Input Sanitation
        if (args.length != 5) {
            throw new Error('Incorrect number of arguments. Expecting 4')
        }
        console.info(' --- Start createBloodBag ---')
        for (arg of args) {
            if (arg.length <= 0) {
                throw new Error('Arguments must be non-empty strings')
            }
        }
        // Get all arguments into constants 
        let bloodBagID = Math.random().toString(36).slice(2)
        let bloodBagOriginID = args[0]
        let bloodBagLocation = args[1]
        let bloodBagStatus = 'UNASIGNED'
        let bloodBagReceiver = 'UNASIGNED'
        let bloodBagDestination = 'UNASIGNED'
        let bloodType = args[2]
        let bloodRH = args[3]
        let bloodBagSize = parseInt(args[4])
        // Check for data types
        if(typeof bloodBagQuantity !== 'number') {
            throw new Error('4th argument must be a numeric string')
        }

        // Check if blood bag already exists
        let bloodBagState = await stub.getState(bloodBagID)
        if (bloodBagState.toString()) {
            throw new Error('Blood Bag: '+bloodBagID+' already exists.')
        }

        //Create Blood Bag object and marshal to JSON
        let bloodBag = {}
        bloodBag.docType = 'bloodbag'
        bloodBag.id = bloodBagID
        bloodBag.originId = bloodBagOriginID
        bloodBag.location = bloodBagLocation
        bloodBag.status = bloodBagStatus
        bloodBag.recipient = bloodBagReceiver
        bloodBag.destination = bloodBagDestination
        bloodBag.type = bloodType
        bloodBag.rh = bloodRH 
        bloodBag.size = bloodBagSize
        // Save Blood Bag to State
        await stub.putState(bloodBagID,Buffer.from(JSON.stringify(bloodBag)))
        let indexName='type~id'
        let typeIdIndexKey = await stub.createCompositeKey(indexName,[bloodBag.type,bloodBag.id])
        console.info(typeIdIndexKey)
        // Save index to state. Only the key name is needed, no need to store a duplicate of the blood.
        // Note - Passing a 'nil' value will effectively delete the key from state, therefore, we pass null character as value.
        await stub.putState(typeIdIndexKey,Buffer.from('\u0000'))
        // Blood Bag Saved and Indexed. Transaction success
        console.info(' --- end createBloodBag --- ')
     }

     /**
      * Reads a Blood Bag's information from the ledger
      * @param {Object} stub Chaincode code executor
      * @param {Object} args Bag Arguments such as bloodId
      * @param {Object} thisClass References to this class
      * @returns {Object} Blood Bag data
      */
     async readBloodBag(stub,args,thisClass){
         // Input Sanitation
         if(args.length != 1){
             throw new Error('Incorrect number of arguments. Expecting ID of Blood Bag to query')
         }
         // Start query
         let ID = args[0]
         if (!ID) {
             throw new Error('Blood Bag ID must not be empty')
         }
         //Query the ledger
         let bloodBagAsBytes = await stub.getState(ID)
         if (!bloodBagAsBytes.toString()){
             let jsonResp = {}
             jsonResp.Error = 'Blood Bag ['+ID+'] does not exist'
             throw new Error(JSON.stringify(jsonResp))
         }
         console.info('[BLOOD BAG RETRIEVED] ~ '+bloodBagAsBytes.toString()+' ~ [BLOOD BAG RETRIEVED]')
         return bloodBagAsBytes
     }

     /**
      * Delete's a Blood Bag's record from the ledger
      * @param {Object} stub Chaincode code executor
      * @param {Object} args Bag Arguments such as bloodId
      * @param {Object} thisClass References to this class
      * @returns {Object} Function Execution Success Flag
      */
     async deleteBloodBag(stub,args,thisClass){
        //Input Sanity Check
        if(args.length != 1){
            throw new Error('Incorrect number of arguments. Expecting ID of the Blood Bag to delete')
        }
        // Get the Blood Bag ID
        let ID = args[0]
        if (!ID) {
            throw new Error('Blood Bag ID must not be empty')
        }
        // To maintain the Index consistency, we need to read the bag first and get it's type.
        let bagAsBytes = await stub.getState(ID)
        let jsonResp = {}
        if (!bagAsBytes) {
            jsonResp.Error = 'Blood Bag ['+ID+'] does not exist'
            throw new Error(JSON.stringify(jsonResp))
        }
        let bagJSON = {}
        try {
            bagJSON = JSON.parse(bagAsBytes.toString())
        }catch(err) {
            jsonResp.error = 'Failed to decode JSON of: '+ID
            throw new Error(jsonResp)
        }

        await stub.deleteState(ID)

        //Delete the index
        let indexName = 'type~id'
        let typeIdIndexKey = stub.createCompositeKey(indexName,[bagJSON.type,bagJSON.id])
        if (!typeIdIndexKey){
            throw new Error('Failed to create the composite key')
        }
        // Delete index entry to state
        await stub.deleteState(typeIdIndexKey)
     }

     /**
      * Mutate's a Blood Bag when moving to a new location
      * @param {Object} stub Chaincode code executor
      * @param {Object} args Bag Arguments such as bloodId and location
      * @param {Object} thisClass References to this class
      * @returns {Object} Function Execution Success Flag
      */
     async moveBagToLocation(stub,args,thisClass) {
         // Input Sanitation
        if (args.length < 2){
            throw new Error('Incorrect number of arguments. Expecting Blood Bag\'s ID and new Location')
        }
        let ID = args[0]
        let location = args[1]
        console.info(' --- start moveBag',ID,'toLocation',location,'---')
        //Query for a bag's information
        let bagAsBytes = await stub.getState(ID)
        if (!bagAsBytes || !bagAsBytes.toString()){
            throw new Error('Bag ['+ID+'] does not exist')
        }
        
        //Create a JSON for the bag
        let bagToMove = {}
        try {
            bagToMove = JSON.parse(bagAsBytes.toString())
        } catch (err) {
            let jsonResp = {}
            jsonResp.error = 'Failed to decode JSON of: '+ID
            throw new Error(jsonResp)
        }

        //Change it's data
        if(bagToMove.destination == location) {
            bagToMove.location = location
            bagToMove.status = 'RECEIVED'
        } else {
            bagToMove.location = location
            bagToMove.status = 'INTRANSIT'
        }

        //Rewrite it to the ledger
        let bagJSONasBytes = Buffer.from(JSON.stringify(bagToMove))
        await stub.putState(ID,bagJSONasBytes)
        console.info(' --- end moveBagToLocation --- ')
     }

     /**
      * Mutate's a Blood Bag when a recipient has been selected
      * @param {Object} stub Chaincode code executor
      * @param {Object} args Bag Arguments such as bloodId, recipient and Destination
      * @param {Object} thisClass References to this class
      * @returns {Object} Function Execution Success Flag
      */
     async assignBloodBagReceiver(stub,args,thisClass) {
        // Input Sanitation
       if (args.length < 3){
           throw new Error('Incorrect number of arguments. Expecting Blood Bag\'s ID, recipientID and Destination')
       }
       let ID = args[0]
       let recipient = args[1]
       let destination = args[2]

       console.info(' --- start assignBloodBagReceiver',ID,'---')
       //Query for a bag's information
       let bagAsBytes = await stub.getState(ID)
       if (!bagAsBytes || !bagAsBytes.toString()){
           throw new Error('Bag ['+ID+'] does not exist')
       }
       
       //Create a JSON for the bag
       let bagToMove = {}
       try {
           bagToMove = JSON.parse(bagAsBytes.toString())
       } catch (err) {
           let jsonResp = {}
           jsonResp.error = 'Failed to decode JSON of: '+ID
           throw new Error(jsonResp)
       }

       //Change it's data
       bagToMove.recipient = recipient
       bagToMove.destination = destination
       bagToMove.status = 'ASSIGNED'

       //Rewrite it to the ledger
       let bagJSONasBytes = Buffer.from(JSON.stringify(bagToMove))
       await stub.putState(ID,bagJSONasBytes)
       console.info(' --- end assignBloodBagReceiver --- ')
    }
 }