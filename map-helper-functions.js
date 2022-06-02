/**
 * This file contains functions and logic to interact with the map
 * provided by the "Leaflet" library, like instantiating the map itself, 
 * adding and removing markers, etc.
 */

const initialLatLng = [52.5, 13.4]; // initial map center coordinate, in this case it's Berlin

const map = new L.Map("map", {
    center: L.latLng(...initialLatLng),
    zoom: 13,
    zoomControl: false
});

const tentativeMarkers = {
    depot: L.featureGroup(),
    customer: L.featureGroup()
};

const markers = L.featureGroup();

const lines = L.featureGroup();

const initialzeMap = () => {
    L.control.zoom({ position: "bottomright" }).addTo(map);

    L.tileLayer(APIEndpoints.GetImageTiles, {
        attribution: "© " + new Date().getFullYear() + ", PTV Group, HERE",
        minZoom: 5,
        maxZoom: 23
    }, [
        {header: 'apiKey', value: api_key}
    ]).addTo(map); 

    tentativeMarkers.depot.addTo(map);
    tentativeMarkers.customer.addTo(map);
    markers.addTo(map);
    lines.addTo(map);
};

const addTentativeMarkerToMap = (latitude, longitude, locationType) => {
    tentativeMarkers[locationType].clearLayers();
    const marker = L.marker([latitude, longitude])
    marker.addTo(tentativeMarkers[locationType]);
    map.panTo([latitude, longitude]);
};

const addMarkerToMap = (latitude, longitude) => {
    const marker = L.marker([latitude, longitude])
    marker.addTo(markers);
    map.panTo([latitude, longitude]);
};

const clearTentativeMarkers = () => {
    tentativeMarkers.depot.clearLayers();
    tentativeMarkers.customer.clearLayers();
}; 

const clearAllLines = () => lines.clearLayers();

const clearAllMarkers = () => {
    clearAllLines();
    markers.clearLayers();
};

const addPolylineToMap = (coordinates) => {
    const randomColor = "#" + (Math.random() * 0xFFFFFF << 0).toString(16).padStart(6, "0");
    const polyline = L.polyline(coordinates, {color: randomColor});
    const decorator = L.polylineDecorator(polyline, {
        patterns: [{
            offset: '100%',
            repeat: 0,
            symbol: L.Symbol.arrowHead({
                pixelSize: 20,
                polygon: false,
                pathOptions: {
                    stroke: true,
                    color: randomColor
                }
            })
        }]
      })

    polyline.addTo(lines);
    decorator.addTo(lines);

    map.fitBounds(markers.getBounds());
}