
/**
 * This file contains the main application logic and state.
 * All API requests regarding PTVs route optimization and geocoding happen here.
 */

const api_key = "YOUR_API_KEY";
const APIEndpoints = {
    SearchLocations: (searchText) => `https://api.myptv.com/geocoding/v1/locations/by-text?searchText=${searchText}`,
    CreatePlan: "https://api.myptv.com/routeoptimization/v1/plans",
    StartOptimization: (planId) => `https://api.myptv.com/routeoptimization/v1/plans/${planId}/operation/optimization?tweaksToObjective=IGNORE_MINIMIZATION_OF_NUMBER_OF_ROUTES`,
    GetOptimizationProgress: (planId) => `https://api.myptv.com/routeoptimization/v1/plans/${planId}/operation`,
    GetOptimizedPlan: (planId) => `https://api.myptv.com/routeoptimization/v1/plans/${planId}`,
    GetImageTiles: "https://api.myptv.com/rastermaps/v1/image-tiles/{z}/{x}/{y}?size={tileSize}&style=silica"
};

const applyHeaders = (configuration) => ({
     ...configuration,
     headers: {
        "apiKey": api_key,
        ...configuration ? { ...configuration.headers } : {}
    }
});

/**
 * This object represents the application state
 */
const appState = {
    depot: undefined,
    customer: undefined,
    depotAndCustomers: [],
    locations: [],
    transports: [],
    optimizedPlan: undefined,
    selectedVehicleIndex: 0
};

const LocationType = {
    Depot: "depot",
    Customer: "customer"
};

const ServiceTypes = {
    Pickup: "pickup",
    Delivery: "delivery"
};

/**
 * Applications entry point, triggered by "window.onload" event
 */
const initializeApplication = () => {
    initialzeMap();

    getElement("depot-location").addEventListener("input", debounce((event) => findLocationsByText(event, LocationType.Depot), 250));
    getElement("customer-location").addEventListener("input", debounce((event) => findLocationsByText(event, LocationType.Customer), 250));
    getElement("btn-add-transport").addEventListener("click", addTransport);
    getElement("btn-start-optimization").addEventListener("click", optimizeTransports);
    getElement("previous-vehicle").addEventListener("click", () => switchSelectedVehicle(-1));
    getElement("next-vehicle").addEventListener("click", () => switchSelectedVehicle(1));
    getElement("close-error-details").addEventListener("click", () => hideElement("error-log"));
    getElement("clear-data").addEventListener("click", () => clearAllData());
    window.addEventListener('beforeunload', (e) => { e.preventDefault(); e.returnValue = ''; });
};

const createOptimizationPlan = () => {
    const vehicles = [];

    for (let i = 1; i <= 2; i++) {
        const numberOfVehicles = getElement("number-of-vehicles-" + i).value;
        const vehicleProfileSelection = getElement("vehicle-profile-" + i);
        const vehicleProfile = vehicleProfileSelection.options[vehicleProfileSelection.selectedIndex].value;
        const capacity = Number(getElement("number-of-capacity-" + i).value);   
        
        for (let n = 1; n <= numberOfVehicles; n++) {
            vehicles.push({
                id: "Vehicle " + (vehicles.length + 1),
                profile: vehicleProfile,
                startLocationId: lookupDepotLocation().id,
                endLocationId: lookupDepotLocation().id,
                capacities: [capacity]
            });
        }
    }

    const planningHorizon = {
        start: new Date(new Date().setHours(0, 0, 0, 0)).toISOString(),
        end: new Date(new Date().setHours(23, 59, 59, 999)).toISOString()
    };

    const restrictions = {
        singleTripPerRoute: false,
        singleDepotPerRoute: true
    };

    const planToBeOptimized = {
        locations: appState.locations,
        transports: appState.transports,
        vehicles,
        planningHorizon,
        restrictions
    };

    return fetch(
                APIEndpoints.CreatePlan,
                applyHeaders({
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(planToBeOptimized)
                })
            ).then(response => response.ok ? response.json() : logError(response))
};

const startOptimization = (planId) =>
    fetch(
        APIEndpoints.StartOptimization(planId),
        applyHeaders({
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            }
        })
    ).then(response => response.ok ? true : logError(response));

const getOptimizationProgress = (planId) =>
    fetch(
        APIEndpoints.GetOptimizationProgress(planId),
        applyHeaders()
    ).then(response => response.ok ? response.json() : logError(response));

const getOptimizedPlan = (planId) =>
    fetch(
        APIEndpoints.GetOptimizedPlan(planId),
        applyHeaders()
    ).then(response => response.ok ? response.json() : logError(response));

const findLocationsByText = (inputEvent, locationType) => {
    const { id, value } = inputEvent.target;

    if (!value) {
        appState[locationType] = undefined;
        disableElement(["btn-add-transport"]);
        return;
    }

    fetch(
        APIEndpoints.SearchLocations(value),
        applyHeaders()
    ).then(
        response => response.json()
    ).then(({locations}) => {
        const suggestionsList = getElement(id + "-suggestions");
        removeAllChildNodes(suggestionsList);

        locations.forEach(location => {
            const suggestion = document.createElement("li");
            suggestion.innerText = `${location.formattedAddress}, ${location.address.countryName}`;
            suggestion.addEventListener("click", () => selectLocationSuggestion(location, id, locationType));
            suggestionsList.appendChild(suggestion);
        });

        showElement(id + "-suggestions");
    });
};

const optimizeTransports = async () => {
    showElement("processing-indicator", "flex");

    const plan = await createOptimizationPlan();
    if (!plan) return;

    const startSuccessful = await startOptimization(plan.id);
    if (!startSuccessful) return;

    const interval = setInterval( async () => {
        const progress = await getOptimizationProgress(plan.id);
        if (!progress) return clearInterval(interval);

        if (progress.status === "SUCCEEDED") {
            clearInterval(interval);
            const optimizedPlan = await getOptimizedPlan(plan.id);
            if (!optimizedPlan) return;
            appState.optimizedPlan = optimizedPlan;
            populateRouteDetails();
            populateKPIs();
            drawRoutes();
            showElement("optimization-results", "flex");
            hideElement("processing-indicator");
            hideElement("hint-1");
            hideElement("hint-2");
        }
    }, 500);
};

const selectLocationSuggestion  = (location, inputElementId, locationType) => {
    getElement(inputElementId).value = `${location.formattedAddress}, ${location.address.countryName}`;
    hideElement(inputElementId + "-suggestions");

    appState[locationType] = location;

    const { latitude, longitude } = { ...location.referencePosition };
    addTentativeMarkerToMap(latitude, longitude, locationType);

    if (appState.depot && appState.customer) enableElement(["btn-add-transport"]);
}

const getOpeningTimes = (isPickup) => {
    const openingFromValue = isPickup ? getElement("depot-from").value : getElement("customer-from").value;
    const openingToValue = isPickup ? getElement("depot-to").value : getElement("customer-to").value;

    const [hoursFrom, minutesFrom] = openingFromValue.split(":").map(value => Number(value));
    const [hoursTo, minutesTo] = openingToValue.split(":").map(value => Number(value));

    return {
        from: [hoursFrom, minutesFrom],
        to: [hoursTo, minutesTo]
    }
};

const mapToLocation = (location, locationType) => {
    const isDepot = locationType === LocationType.Depot;
    const id = (isDepot ? "D" : "C") + (appState.transports.length + 1);
    const { latitude, longitude } = { ...location.referencePosition };

    const { from, to } = getOpeningTimes(isDepot);

    const start = new Date();
    start.setHours(from[0], from[1], 0, 0);

    const end = new Date();
    end.setHours(to[0], to [1], 0, 0);

    return {
        id,
        type: locationType.toUpperCase(),
        latitude,
        longitude,
        openingIntervals: [{
            start: start.toISOString(),
            end: end.toISOString()
        }]
    };
};

const createNewTransport = (depotLocationId, customerLocationId, isDelivery) => {
    const pickupServiceTimeSeconds = getElement(isDelivery ? "depot-service-time" : "customer-service-time").value * 60;
    const deliveryServiceTimeSeconds = getElement(isDelivery ? "customer-service-time" : "depot-service-time").value * 60;
    const quantity = Number(getElement("quantity").value);

    return {
        id: `Transport-${depotLocationId}-${customerLocationId}`,
        pickupLocationId: isDelivery ? depotLocationId : customerLocationId,
        pickupServiceTime: pickupServiceTimeSeconds,
        deliveryLocationId: isDelivery ? customerLocationId : depotLocationId,
        deliveryServiceTime: deliveryServiceTimeSeconds,
        quantities: [quantity]
    }
};

const addTransport = () => {
    const { depot, customer } = appState;
    let depotLocation = lookupDepotLocation();
    if (!depotLocation) {
        depotLocation = mapToLocation(depot, LocationType.Depot);
    }
    const customerLocation = mapToLocation(customer, LocationType.Customer);

    const serviceTypeValue = document.querySelector('input[name="service-type"]:checked').value;
    const isDelivery = serviceTypeValue === ServiceTypes.Delivery;

    clearTentativeMarkers();

    if (!lookupDepotLocation()) {
        appState.depotAndCustomers.push({ id: depotLocation.id, ...depot });
        appState.locations.push(depotLocation);
        addMarkerToMap(depotLocation.latitude, depotLocation.longitude);
    }

    appState.depotAndCustomers.push({ id: customerLocation.id, ...customer });        
    appState.locations.push(customerLocation);
    addMarkerToMap(customerLocation.latitude, customerLocation.longitude);

    const newTransport = createNewTransport(depotLocation.id, customerLocation.id, isDelivery);
    appState.transports.push(newTransport);
    updateTransportsOverviewTable(customerLocation.id, newTransport.quantities[0], serviceTypeValue);

    appState.customer = undefined;

    disableElement(["btn-add-transport", "depot-location", "depot-from", "depot-to", "depot-service-time"]);
    enableElement(["btn-start-optimization"]);
    showElement("hint-1");
    showElement("hint-2");
    getElement("customer-location").value = "";
};

const clearAllData = () => {
    appState.depot = undefined;
    appState.customer = undefined;
    appState.transports = [];
    appState.locations = [];
    appState.depotAndCustomers = [];
    appState.selectedVehicleIndex = 0;

    clearAllMarkers();
    hideElement("optimization-results");

    removeAllChildNodes(getElement("transports-overview").getElementsByTagName("tbody")[0]);
    disableElement(["btn-start-optimization"]);
    enableElement(["btn-add-transport", "depot-location", "depot-from", "depot-to", "depot-service-time"]);

    ["depot-location", "customer-location"].forEach(id => getElement(id).value = "");
    ["number-of-vehicles-1", "number-of-vehicles-2"].forEach(id => getElement(id).value = 2);
    getElement("vehicle-profile-1").selectedIndex = 1;
    getElement("vehicle-profile-2").selectedIndex = 2;
    getElement("number-of-capacity-1").value = 36;
    getElement("number-of-capacity-2").value = 17;
};

const updateTransportsOverviewTable = (customerLocationId, quantities, serviceType) => {
    const tbody = getElement("transports-overview").getElementsByTagName("tbody")[0];
    const row = tbody.insertRow();
    row.insertCell(0).innerText = lookupLocation(customerLocationId).formattedAddress;
    row.insertCell(1).innerText = quantities;
    row.insertCell(2).innerText = serviceType;
};

const switchSelectedVehicle = (step) => {
    const { selectedVehicleIndex } = appState;
    const { vehicles, unplannedVehicleIds } = appState.optimizedPlan;
    const usedVehicles = vehicles.filter(vehicle => !unplannedVehicleIds.includes(vehicle.id));

    let newIndex = selectedVehicleIndex + step;
    if (newIndex < 0) newIndex = usedVehicles.length - 1;
    if (newIndex > usedVehicles.length - 1) newIndex = 0;

    appState.selectedVehicleIndex = newIndex;
    populateRouteDetails(newIndex);
};

const populateRouteDetails = (vehicleIndex = 0) => {
    const { vehicles, routes, unplannedVehicleIds } = appState.optimizedPlan;

    const usedVehicles = vehicles.filter(vehicle => !unplannedVehicleIds.includes(vehicle.id));
    if (!usedVehicles[vehicleIndex]) return;

    const vehicleId = usedVehicles[vehicleIndex].id;
    const routesOfVehicle = routes.filter(route => route.vehicleId === vehicleId);

    getElement("vehicle-id").innerText = vehicleId;
    getElement("vehicle-profile").innerText =  usedVehicles[vehicleIndex].profile;

    const table = getElement("route-details");
    const tbody = table.getElementsByTagName("tbody")[0];
    removeAllChildNodes(tbody);

    routesOfVehicle.forEach((route, routeIndex) =>
        route.stops.forEach((stop, stopIndex) => {
            const row = tbody.insertRow();
            const tripNumberCell = row.insertCell(0);
            const stopNumberCell = row.insertCell(1);
            const stopCell = row.insertCell(2);
            const eventCell = row.insertCell(3);
            const arrivalTimeCell = row.insertCell(4);
            const quantityCell = row.insertCell(5);

            tripNumberCell.innerText = routeIndex + 1;
            stopNumberCell.innerText = stopIndex + 1;
            stopCell.innerText = lookupLocation(stop.locationId).formattedAddress;
            eventCell.innerText = stop.deliveryIds.length > 0 ? "Delivery" : (stop.pickupIds.length > 0 ? "Pickup" : "Vehicle Location");
            arrivalTimeCell.innerText = new Date(stop.reportForStop.arrivalTime).toLocaleTimeString();
            quantityCell.innerText =  stop.reportForStop.quantities ? stop.reportForStop.quantities[0] : 0;
        })
     ) ;

    const totalDistance = routesOfVehicle.reduce((sum, route) => sum + route.report.distance, 0);
    const totalTravelTime = routesOfVehicle.reduce((sum, route) => sum + route.report.travelTime, 0);
    getElement("vehicle-travel-distance").innerText = formatMetersToKilometers(totalDistance);
    getElement("vehicle-travel-time").innerText = formatSecondsToHHMM(totalTravelTime);
    if (vehicles.length - unplannedVehicleIds.length < 2) disableElement(["previous-vehicle", "next-vehicle"]);
};

const drawRoutes = () => {
    clearAllLines();
    const { locations, routes } = appState.optimizedPlan;
    routes.forEach(route => {
        const locationIds = route.stops.map(stop => stop.locationId);
        const coordinates = locationIds.map(locationId => {
            const location = locations.find(location => location.id === locationId)
            return [location.latitude, location.longitude];
        });
        addPolylineToMap(coordinates);
    });
};

const populateKPIs = () => {
    const { routes, transports, unplannedTransportIds, vehicles, unplannedVehicleIds } = appState.optimizedPlan;
    const totalTravelTime = routes.reduce((sum, route) => sum + route.report.travelTime, 0);
    const totalDrivingTime = routes.reduce((sum, route) => sum + route.report.drivingTime, 0);
    const totalDistance = routes.reduce((sum, route) => sum + route.report.distance, 0);
    const totalBreakTime = routes.reduce((sum, route) => sum + route.report.breakTime, 0);
    const totalRestTime = routes.reduce((sum, route) => sum + route.report.restTime, 0);
    const totalWaitingTime = routes.reduce((sum, route) => sum + route.report.waitingTime, 0);

    getElement("used-vehicles").innerText = vehicles.length - unplannedVehicleIds.length;
    getElement("unused-vehicles").innerText = unplannedVehicleIds.length;
    getElement("planned-transports").innerText = transports.length - unplannedTransportIds.length;
    getElement("unplanned-transports").innerText = unplannedTransportIds.length;
    getElement("total-travel-time").innerText = formatSecondsToHHMM(totalTravelTime);
    getElement("total-driving-time").innerText = formatSecondsToHHMM(totalDrivingTime);
    getElement("total-travel-distance").innerText = formatMetersToKilometers(totalDistance);
    getElement("total-break-time").innerText = formatSecondsToHHMM(totalBreakTime);
    getElement("total-rest-time").innerText = formatSecondsToHHMM(totalRestTime);
    getElement("total-waiting-time").innerText = formatSecondsToHHMM(totalWaitingTime);
};

const logError = async (response) => {
    const errorDetails = await response.json();
    getElement("error-details").innerHTML = JSON.stringify(errorDetails, null, 2);
    showElement("error-log");
    hideElement("processing-indicator");
    return false;
};

window.onload = initializeApplication;