import React, { useState } from "react";

export default function LocationService() {
    const [userLocation, setUserLocation] = useState(null);

    const getUserLocation = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    alert(position)
                }, 
                (error) => {
                    alert(error)
                }
            )
        } else {
            console.error("Geolocation is not supported by this browser.")
            alert("Geolocation isn't supported by this browser. Certain location features might not be available or might be restricted.")
        }
    }

    return (
        <button onClick={getUserLocation}>Get User Location</button>
    )
}